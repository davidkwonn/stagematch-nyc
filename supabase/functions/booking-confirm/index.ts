// booking-confirm { booking_id, decline? } → { status }
// Artist or venue confirms (or declines) a booking still in negotiation.
// Both confirmations → 'confirmed'. Mack's set_booking_terms resets
// artist_confirmed / venue_confirmed to false when it changes the terms.

import { HttpError, json, serve } from '../_shared/cors.ts';
import { db, getCaller, log, postAgentMessage } from '../_shared/db.ts';
import { conflictingBooking } from '../_shared/calendar.ts';
import { formatDate, formatTime, isoDate, todayNY, usd } from '../_shared/format.ts';
import { isUuid, readJson } from '../_shared/internal.ts';

serve(async req => {
  const { booking_id, decline } = await readJson<{ booking_id?: string; decline?: boolean }>(req);
  if (!isUuid(booking_id)) throw new HttpError(400, 'booking_id required');

  const caller = await getCaller(req);
  const { data: b } = await db.from('bookings')
    .select('*, venue:venues(name), artist:artists(name), thread:threads(id)')
    .eq('id', booking_id).maybeSingle();
  if (!b) throw new HttpError(404, 'booking not found');

  const role = caller.artist?.id === b.artist_id ? 'artist' : caller.venue?.id === b.venue_id ? 'venue' : null;
  if (!role) throw new HttpError(403, 'not part of this booking');
  if (b.status !== 'negotiating') throw new HttpError(409, `booking is ${b.status}`);
  const threadId: string | undefined = b.thread?.[0]?.id;
  const who = role === 'artist' ? b.artist.name : b.venue.name;

  if (decline) {
    const { data: done } = await db.from('bookings').update({ status: 'cancelled' })
      .eq('id', b.id).eq('status', 'negotiating').select('id').maybeSingle();
    if (!done) throw new HttpError(409, 'booking changed, refresh');
    if (threadId) {
      await postAgentMessage(threadId,
        `${who} has decided to pass on this one. No hard feelings, thanks both for your time. I'll keep looking for the right fit.`);
    }
    await log('booking', 'booking_declined', { booking_id: b.id, by: role, who });
    return json({ status: 'cancelled' });
  }

  if (!b.gig_date || b.offer_usd == null) throw new HttpError(409, 'date and pay must be set before confirming');
  if (b.gig_date < isoDate(todayNY())) throw new HttpError(409, 'that date has passed, ask Mack for a new one');
  const clash = await conflictingBooking(b.artist_id, b.venue_id, b.gig_date, b.id);
  if (clash) {
    throw new HttpError(409, clash.who === 'artist'
      ? `${b.artist.name} is already booked that night, ask Mack for another date`
      : `${b.venue.name} already has a gig that night, ask Mack for another date`);
  }

  const flag = role === 'artist' ? 'artist_confirmed' : 'venue_confirmed';
  const { data: flagged, error } = await db.from('bookings').update({ [flag]: true })
    .eq('id', b.id).eq('status', 'negotiating').select('id');
  if (error) throw error;
  if (!flagged?.length) throw new HttpError(409, 'booking changed, refresh');
  await log('booking', 'party_confirmed', { booking_id: b.id, by: role, who });

  // Only one request wins the move to 'confirmed', so the summary is posted once.
  const { data: confirmed } = await db.from('bookings').update({ status: 'confirmed' })
    .eq('id', b.id).eq('status', 'negotiating').eq('artist_confirmed', true).eq('venue_confirmed', true)
    .select('gig_date, start_time, set_length_min, offer_usd').maybeSingle();

  if (!confirmed) {
    const other = role === 'artist' ? b.venue.name : b.artist.name;
    if (threadId) await postAgentMessage(threadId, `${who} confirmed. Waiting on ${other}.`);
    return json({ status: 'negotiating' });
  }

  const when = `${formatDate(confirmed.gig_date)}${confirmed.start_time ? ` at ${formatTime(confirmed.start_time)}` : ''}`;
  const set = confirmed.set_length_min ? `, ${confirmed.set_length_min}-minute set` : '';
  if (threadId) {
    await postAgentMessage(threadId,
      `You're both confirmed: ${b.artist.name} at ${b.venue.name}, ${when}${set}, ${usd(confirmed.offer_usd)}. ` +
      `${b.venue.name}, please pay now to hold the booking. I keep the money safe and release it to ${b.artist.name} after the gig.`);
  }
  await log('booking', 'booking_confirmed', {
    booking_id: b.id, venue: b.venue.name, artist: b.artist.name,
    gig_date: confirmed.gig_date, start_time: confirmed.start_time, offer_usd: confirmed.offer_usd,
  });
  return json({ status: 'confirmed' });
});
