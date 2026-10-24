// match { venue_id } → { suggestions, new_count }
// Called by Mack (service role) when a venue finishes intake, and by the UI after a calendar change.
// Refreshes the venue's open cards: new matches are added, still-good ones get today's best slot,
// and cards whose night is gone (past, removed from the calendar, booked elsewhere) are dropped.

import { bookedNights } from '../_shared/calendar.ts';
import { HttpError, json, serve } from '../_shared/cors.ts';
import { db, getCaller, log } from '../_shared/db.ts';
import { isoDate, todayNY } from '../_shared/format.ts';
import { isServiceCall, isUuid, readJson } from '../_shared/internal.ts';
import { type Artist, type AvailabilityRow, rank, type Venue } from './score.ts';

const AVAILABILITY_COLS = 'owner_id, kind, date, weekday, start_time, end_time';

serve(async req => {
  const started = Date.now();
  const { venue_id } = await readJson<{ venue_id?: string }>(req);
  if (!isUuid(venue_id)) throw new HttpError(400, 'venue_id required');

  if (!isServiceCall(req)) {
    const caller = await getCaller(req);
    if (caller.venue?.id !== venue_id) throw new HttpError(403, 'not your venue');
  }

  const today = todayNY();
  const [venueRes, venueAvail, artistsRes, artistAvail, existing, booked] = await Promise.all([
    db.from('venues').select('id, name, borough, genres, budget_usd, set_length_min, start_date').eq('id', venue_id).maybeSingle(),
    db.from('availability').select(AVAILABILITY_COLS).eq('owner_type', 'venue').eq('owner_id', venue_id),
    // Artists the expert bookers turned down are never recommended.
    db.from('artists').select('id, name, borough, genres, rate_usd, start_date, vetting')
      .not('intake_completed_at', 'is', null).neq('vetting', 'rejected'),
    db.from('availability').select(AVAILABILITY_COLS).eq('owner_type', 'artist'),
    db.from('suggestions').select('id, artist_id, status').eq('venue_id', venue_id),
    bookedNights(isoDate(today)),
  ]);
  for (const r of [venueRes, venueAvail, artistsRes, artistAvail, existing]) if (r.error) throw r.error;
  const venue = venueRes.data as Venue | null;
  if (!venue) throw new HttpError(404, 'venue not found');

  const answered = (existing.data ?? []).filter(s => s.status !== 'suggested');
  const open = (existing.data ?? []).filter(s => s.status === 'suggested');
  const ranked = rank({
    venue,
    venueAvailability: (venueAvail.data ?? []) as AvailabilityRow[],
    artists: (artistsRes.data ?? []) as Artist[],
    artistAvailability: (artistAvail.data ?? []) as AvailabilityRow[],
    exclude: new Set(answered.map(s => s.artist_id as string)),
    today,
    venueBooked: booked.venue.get(venue_id),
    artistBooked: booked.artist,
  });

  // Status is left out on purpose: new rows default to 'suggested', and a card the venue
  // answers while this runs keeps its answer.
  if (ranked.length) {
    const { error } = await db.from('suggestions')
      .upsert(ranked.map(r => ({ ...r, venue_id })), { onConflict: 'venue_id,artist_id' });
    if (error) throw error;
  }
  const keep = new Set(ranked.map(r => r.artist_id));
  const stale = open.filter(s => !keep.has(s.artist_id)).map(s => s.id as string);
  if (stale.length) await db.from('suggestions').delete().in('id', stale).eq('status', 'suggested');

  const { data: suggestions, error } = await db.from('suggestions')
    .select('*, artists(*)') // same shape as the app's Suggestion type
    .eq('venue_id', venue_id).eq('status', 'suggested').order('score', { ascending: false });
  if (error) throw error;

  const before = new Set(open.map(s => s.artist_id));
  const newCount = ranked.filter(r => !before.has(r.artist_id)).length;
  await log('matching', ranked.length ? 'suggestions_made' : 'no_suggestions', {
    venue_id,
    venue: venue.name,
    ms: Date.now() - started,
    considered: artistsRes.data?.length ?? 0,
    new_count: newCount,
    dropped: stale.length,
    picks: (suggestions ?? []).map(s => ({ artist: s.artists?.name, score: s.score, slot: `${s.slot_date} ${s.slot_start}`, reason: s.reason })),
  });
  return json({ suggestions: suggestions ?? [], new_count: newCount });
});
