// Whop → Stagehand (no JWT: the Standard Webhooks signature is the auth).
// payment.succeeded → payment held, booking paid_held, Mack confirms in the booking thread.
// Idempotent: a replayed event finds the payment already held and changes nothing.
import { serve, json } from '../_shared/cors.ts';
import { db, log } from '../_shared/db.ts';
import { isUuid, markHeld } from '../_shared/payments/booking.ts';
import { verifyWebhook } from '../_shared/payments/whop.ts';

serve(async req => {
  const event = verifyWebhook(await req.text(), req.headers);
  if (event.type !== 'payment.succeeded') return json({ ok: true, ignored: event.type });

  const payment = event.data;
  const fromMetadata = payment.metadata?.booking_id;
  let bookingId = typeof fromMetadata === 'string' && isUuid(fromMetadata) ? fromMetadata : null;
  if (!bookingId && payment.checkout_configuration_id) {
    const { data } = await db.from('payments').select('booking_id')
      .eq('whop_checkout_id', payment.checkout_configuration_id).maybeSingle();
    bookingId = (data?.booking_id as string | undefined) ?? null;
  }
  // Not one of ours (or not found): acknowledge so Whop stops retrying.
  if (!bookingId) {
    await log('payments', 'webhook_unmatched', { event_id: event.id, whop_payment_id: payment.id });
    return json({ ok: true, matched: false });
  }

  const changed = await markHeld(bookingId, payment.id, { event_id: event.id, paid: payment.total?.amount ?? null });
  return json({ ok: true, changed });
});
