// suggestion-decision { suggestion_id, decision: 'yes' | 'no' } → { booking_id, thread_id } or {}
// The venue answers a suggestion card. Yes opens a booking and its thread with Mack.

import { HttpError, json, serve } from '../_shared/cors.ts';
import { db, getCaller, log, postAgentMessage } from '../_shared/db.ts';
import { conflictingBooking } from '../_shared/calendar.ts';
import { formatDate, formatTime, isoDate, todayNY, usd } from '../_shared/format.ts';
import { isUuid, readJson } from '../_shared/internal.ts';

const DEFAULT_SET_MIN = 60;

// The artist's rate, capped by the venue's budget.
function offerFor(rate: number | null, budget: number | null): number | null {
  if (rate != null && budget != null) return Math.min(rate, budget);
  return rate ?? budget;
}

async function managerThreadFor(artistId: string): Promise<string> {
  const { data: existing } = await db.from('threads').select('id').eq('kind', 'manager').eq('artist_id', artistId).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db.from('threads').insert({ kind: 'manager', artist_id: artistId }).select('id').single();
  if (error) throw error;
  return data.id;
}

serve(async req => {
  const { suggestion_id, decision } = await readJson<{ suggestion_id?: string; decision?: string }>(req);
  if (!isUuid(suggestion_id)) throw new HttpError(400, 'suggestion_id required');
  if (decision !== 'yes' && decision !== 'no') throw new HttpError(400, "decision must be 'yes' or 'no'");

  const caller = await getCaller(req);
  const { data: s } = await db.from('suggestions')
    .select('*, venue:venues(id, name, budget_usd, set_length_min), artist:artists(id, name, rate_usd, set_length_min)')
    .eq('id', suggestion_id).maybeSingle();
  if (!s) throw new HttpError(404, 'suggestion not found');
  if (caller.venue?.id !== s.venue_id) throw new HttpError(403, 'not your venue');

  if (decision === 'no') {
    if (s.status === 'accepted') throw new HttpError(409, 'already accepted');
    await db.from('suggestions').update({ status: 'declined' }).eq('id', s.id);
    await log('matching', 'suggestion_declined', { suggestion_id: s.id, venue: s.venue.name, artist: s.artist.name });
    return json({});
  }

  // Idempotent yes: a double tap returns the booking already made.
  const { data: prior } = await db.from('bookings').select('id, thread:threads(id)').eq('suggestion_id', s.id).maybeSingle();
  if (prior) return json({ booking_id: prior.id, thread_id: prior.thread?.[0]?.id ?? null });

  // A card can go stale: its night passed, or someone else booked it since.
  if (s.slot_date) {
    if (s.slot_date < isoDate(todayNY())) throw new HttpError(409, 'that date has passed, tap Find artists to refresh');
    const clash = await conflictingBooking(s.artist_id, s.venue_id, s.slot_date);
    if (clash) {
      throw new HttpError(409, clash.who === 'artist'
        ? `${s.artist.name} just got booked that night, tap Find artists to refresh`
        : 'you already have a gig that night, tap Find artists to refresh');
    }
  }

  const { data: claimed } = await db.from('suggestions').update({ status: 'accepted' })
    .eq('id', s.id).neq('status', 'accepted').select('id').maybeSingle();
  if (!claimed) throw new HttpError(409, 'already being booked, refresh');

  const offer = offerFor(s.artist.rate_usd, s.venue.budget_usd);
  const setLength = s.venue.set_length_min ?? s.artist.set_length_min ?? DEFAULT_SET_MIN;
  const { data: booking, error: bErr } = await db.from('bookings').insert({
    venue_id: s.venue_id,
    artist_id: s.artist_id,
    suggestion_id: s.id,
    gig_date: s.slot_date,
    start_time: s.slot_start,
    set_length_min: setLength,
    offer_usd: offer,
    status: 'negotiating',
  }).select('id').single();
  if (bErr) {
    // Release the card so the venue can tap Yes again.
    await db.from('suggestions').update({ status: 'suggested' }).eq('id', s.id);
    throw bErr;
  }

  // The inbox embeds artists(*) and venues(*) through the thread, so booking threads carry both ids.
  const { data: thread, error: tErr } = await db.from('threads')
    .insert({ kind: 'booking', booking_id: booking.id, artist_id: s.artist_id, venue_id: s.venue_id }).select('id').single();
  if (tErr) {
    await db.from('bookings').delete().eq('id', booking.id);
    await db.from('suggestions').update({ status: 'suggested' }).eq('id', s.id);
    throw tErr;
  }

  const when = s.slot_date ? `${formatDate(s.slot_date)}${s.slot_start ? ` at ${formatTime(s.slot_start)}` : ''}` : 'a date you both like';
  const pay = offer != null ? `${usd(offer)} for a ${setLength}-minute set` : `a ${setLength}-minute set, pay to agree`;
  await postAgentMessage(thread.id,
    `Hi ${s.artist.name} and ${s.venue.name}, I'm Mack, I'll help you two lock this in. ` +
    `${s.venue.name} would love to have ${s.artist.name} play. Proposed: ${when}, ${pay}. ` +
    `${s.artist.name}, does that date work for you? Once you both press Confirm, ${s.venue.name} pays and I hold the money until the gig.`);

  await postAgentMessage(await managerThreadFor(s.artist_id),
    `${s.venue.name} wants to book you for ${when}. Check your inbox to confirm.`);

  await log('matching', 'booking_opened', {
    suggestion_id: s.id, booking_id: booking.id, thread_id: thread.id,
    venue: s.venue.name, artist: s.artist.name, gig_date: s.slot_date, start_time: s.slot_start, offer_usd: offer,
  });
  return json({ booking_id: booking.id, thread_id: thread.id });
});
