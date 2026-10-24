// { booking_id } → { checkout_url }. The venue pays a confirmed booking on Whop's hosted checkout;
// the money is "held" in `payments` until gig-outcome. WHOP_SIMULATE=true: no Whop call, the
// payment is marked held at once (same effects as the webhook) and checkout_url is null.
import { serve, json, HttpError } from '../_shared/cors.ts';
import { db, getCaller, log, FEE_RATE } from '../_shared/db.ts';
import { bookingThreadId, cents, loadBooking, markHeld, when } from '../_shared/payments/booking.ts';
import { createCheckout, simulate } from '../_shared/payments/whop.ts';

serve(async req => {
  const caller = await getCaller(req);
  const booking = await loadBooking((await req.json()).booking_id);
  if (caller.venue?.id !== booking.venue_id) throw new HttpError(403, 'only the venue can pay this booking');
  if (booking.status !== 'confirmed') throw new HttpError(409, `booking is ${booking.status}, not confirmed`);
  const amount = Number(booking.offer_usd);
  if (!(amount > 0)) throw new HttpError(409, 'booking has no agreed pay');

  // Reuse an open checkout for the same amount instead of creating one per tap.
  const { data: existing } = await db.from('payments')
    .select('status, amount_usd, checkout_url').eq('booking_id', booking.id).maybeSingle();
  if (existing && existing.status !== 'pending') throw new HttpError(409, `payment already ${existing.status}`);
  if (existing?.checkout_url && Number(existing.amount_usd) === amount) return json({ checkout_url: existing.checkout_url });

  const fee = cents(amount * FEE_RATE);
  const terms = { amount_usd: amount, fee_usd: fee, payout_usd: cents(amount - fee) };
  const upsert = async (row: Record<string, unknown>) => {
    const { error } = await db.from('payments').upsert(
      { booking_id: booking.id, ...terms, status: 'pending', updated_at: new Date().toISOString(), ...row },
      { onConflict: 'booking_id' },
    );
    if (error) throw error;
  };

  if (simulate()) {
    await upsert({ whop_checkout_id: null, checkout_url: null });
    await log('payments', 'checkout_simulated', { booking_id: booking.id, ...terms });
    await markHeld(booking.id, null, { simulated: true, ...terms });
    return json({ checkout_url: null });
  }

  // Back to the booking thread after paying (no redirect until APP_URL is set).
  // TODO(ui): confirm the inbox route with the Lovable owner.
  const threadId = await bookingThreadId(booking.id);
  const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  const checkout = await createCheckout({
    bookingId: booking.id,
    title: `Stagehand: ${booking.artist.name} at ${booking.venue.name}, ${when(booking.gig_date)}`,
    amountUsd: amount,
    redirectUrl: appUrl && (threadId ? `${appUrl}/inbox/${threadId}` : appUrl),
  });
  await upsert({ whop_checkout_id: checkout.id, checkout_url: checkout.url });
  await log('payments', 'checkout_created', { booking_id: booking.id, whop_checkout_id: checkout.id, ...terms });
  return json({ checkout_url: checkout.url });
});
