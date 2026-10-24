// Booked nights: a confirmed (or later) booking takes the night for both the artist and the venue.

import { db } from './db.ts';

export const BOOKED_STATUSES = ['confirmed', 'paid_held', 'performed', 'released'];

export type BookedNights = { artist: Map<string, Set<string>>; venue: Map<string, Set<string>> };

// Every booked night from `from` on, by artist and by venue.
export async function bookedNights(from: string): Promise<BookedNights> {
  const { data, error } = await db.from('bookings').select('artist_id, venue_id, gig_date')
    .in('status', BOOKED_STATUSES).gte('gig_date', from);
  if (error) throw error;
  const out: BookedNights = { artist: new Map(), venue: new Map() };
  for (const b of data ?? []) {
    if (!b.gig_date) continue;
    out.artist.set(b.artist_id, (out.artist.get(b.artist_id) ?? new Set()).add(b.gig_date));
    out.venue.set(b.venue_id, (out.venue.get(b.venue_id) ?? new Set()).add(b.gig_date));
  }
  return out;
}

// The other booking that already holds this night for the artist or the venue, if any.
export async function conflictingBooking(artistId: string, venueId: string, date: string, exceptBookingId?: string) {
  let q = db.from('bookings').select('id, artist_id, venue_id').eq('gig_date', date).in('status', BOOKED_STATUSES)
    .or(`artist_id.eq.${artistId},venue_id.eq.${venueId}`).limit(1);
  if (exceptBookingId) q = q.neq('id', exceptBookingId);
  const { data, error } = await q;
  if (error) throw error;
  const hit = data?.[0];
  return hit ? { id: hit.id as string, who: hit.artist_id === artistId ? 'artist' as const : 'venue' as const } : null;
}
