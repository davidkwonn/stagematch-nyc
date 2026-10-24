// Booking state for the payments slice. Every transition is a conditional update
// (`.eq('status', from)`), so a replayed webhook or a double tap changes nothing.
import { HttpError } from '../cors.ts';
import { db, log, postAgentMessage } from '../db.ts';

export type Booking = {
  id: string;
  venue_id: string;
  artist_id: string;
  gig_date: string | null;
  start_time: string | null;
  offer_usd: number | null;
  status: string;
  artist: { name: string };
  venue: { name: string };
};

export async function loadBooking(bookingId: unknown): Promise<Booking> {
  if (typeof bookingId !== 'string' || !isUuid(bookingId)) throw new HttpError(400, 'booking_id required');
  const { data, error } = await db.from('bookings')
    .select('*, artist:artists!bookings_artist_id_fkey(name), venue:venues!bookings_venue_id_fkey(name)')
    .eq('id', bookingId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'booking not found');
  return data as Booking;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function bookingThreadId(bookingId: string) {
  const { data } = await db.from('threads').select('id').eq('booking_id', bookingId).eq('kind', 'booking').maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// The artist's private thread with Mack, created if missing (seeded artists may have none).
export async function artistManagerThreadId(artistId: string) {
  const find = () => db.from('threads').select('id').eq('artist_id', artistId).eq('kind', 'manager').maybeSingle();
  const { data } = await find();
  if (data) return data.id as string;
  const { data: created } = await db.from('threads').insert({ kind: 'manager', artist_id: artistId }).select('id').maybeSingle();
  if (created) return created.id as string;
  const { data: raced } = await find(); // lost a race on the one-manager-thread index
  return (raced?.id as string | undefined) ?? null;
}

// Returns false when the booking was not in `from` (someone else already moved it).
export async function moveBooking(bookingId: string, from: string, to: string) {
  const { data, error } = await db.from('bookings').update({ status: to })
    .eq('id', bookingId).eq('status', from).select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// Returns the updated payment, or null when it was not in `from`.
export async function setPaymentStatus(bookingId: string, from: string, to: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await db.from('payments').update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq('booking_id', bookingId).eq('status', from).select('amount_usd, payout_usd').maybeSingle();
  if (error) throw error;
  return data as { amount_usd: number; payout_usd: number } | null;
}

// Claims a held payment for one payout attempt (compare-and-set on updated_at), so two
// attempts can't pay the artist at once. Returns the claim stamp, or null if someone else holds it.
export async function leasePayment(bookingId: string, seenUpdatedAt: string) {
  const stamp = new Date().toISOString();
  const { data, error } = await db.from('payments').update({ updated_at: stamp })
    .eq('booking_id', bookingId).eq('status', 'held').eq('updated_at', seenUpdatedAt).select('id').maybeSingle();
  if (error) throw error;
  return data ? stamp : null;
}

// Payment received (Whop webhook, or WHOP_SIMULATE in whop-checkout): payment held, booking paid_held.
// Mack tells the artist exactly what is secured for them. Returns false when it was already recorded.
export async function markHeld(bookingId: string, whopPaymentId: string | null, detail: Record<string, unknown> = {}) {
  const payment = await setPaymentStatus(bookingId, 'pending', 'held', { whop_payment_id: whopPaymentId });
  if (!payment) return false;
  const moved = await moveBooking(bookingId, 'confirmed', 'paid_held');
  const booking = await loadBooking(bookingId);
  if (!moved) {
    await log('payments', 'payment_held_needs_review', { booking_id: bookingId, booking_status: booking.status, whop_payment_id: whopPaymentId, needs_human: true, ...detail });
    return true;
  }
  await log('payments', 'payment_held', { booking_id: bookingId, whop_payment_id: whopPaymentId, ...detail });
  const threadId = await bookingThreadId(bookingId);
  if (threadId) {
    await postAgentMessage(threadId,
      `Payment received: ${booking.venue.name} paid ${usd(payment.amount_usd)} and Stagehand is holding it until the show` +
      `${whopPaymentId ? '' : ' (demo mode: no real money moved)'}. ${booking.artist.name}, your ${usd(payment.payout_usd)} ` +
      `is secured: it goes to you as soon as ${booking.venue.name} confirms the gig. You're booked for ` +
      `${when(booking.gig_date, booking.start_time)}.`);
  }
  return true;
}

// "$150" or "$127.50".
export const usd = (n: number | string) => {
  const v = Number(n);
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
};

export const cents = (n: number) => Math.round(n * 100) / 100;

// "Fri Nov 7 at 9 pm" from a date and a time column, with no timezone drift.
export function when(date: string | null, time?: string | null) {
  if (!date) return 'the agreed date';
  const day = new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .replace(',', '');
  if (!time) return day;
  const [h, m] = time.split(':').map(Number);
  return `${day} at ${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}
