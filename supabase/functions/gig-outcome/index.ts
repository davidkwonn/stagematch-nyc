// { booking_id, performed } → { status }. The venue reports the gig.
// performed → booking performed then released, the artist's payout (amount minus our fee) goes out
// as a Whop claim link in the artist's own manager thread (simulated if Whop can't fund it yet).
// no-show → full Whop refund to the venue, booking and payment refunded.
// The booking moves first with a conditional update, so a double tap can't pay or refund twice.
import { serve, json, HttpError } from '../_shared/cors.ts';
import { db, getCaller, log, postAgentMessage } from '../_shared/db.ts';
import {
  artistManagerThreadId, bookingThreadId, loadBooking, moveBooking, setPaymentStatus, usd, when, type Booking,
} from '../_shared/payments/booking.ts';
import { createPayoutLink, refundPayment } from '../_shared/payments/whop.ts';

type Payment = { amount_usd: number; fee_usd: number; payout_usd: number; whop_payment_id: string | null; status: string };

// Demo mode (default) lets the venue report before the gig date; DEMO_MODE=false enforces it.
const demoMode = () => Deno.env.get('DEMO_MODE') !== 'false';
const todayInNewYork = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

serve(async req => {
  const caller = await getCaller(req);
  const body = await req.json();
  if (typeof body.performed !== 'boolean') throw new HttpError(400, 'performed (boolean) required');
  const booking = await loadBooking(body.booking_id);
  if (caller.venue?.id !== booking.venue_id) throw new HttpError(403, 'only the venue can report the gig');
  if (booking.status !== 'paid_held') throw new HttpError(409, `booking is ${booking.status}, not paid_held`);
  if (!demoMode() && booking.gig_date && booking.gig_date > todayInNewYork()) {
    throw new HttpError(409, 'the gig has not happened yet');
  }
  const { data: payment } = await db.from('payments')
    .select('amount_usd, fee_usd, payout_usd, whop_payment_id, status').eq('booking_id', booking.id).maybeSingle();
  if (payment?.status !== 'held') throw new HttpError(409, 'no held payment for this booking');

  const status = body.performed ? await release(booking, payment as Payment) : await refund(booking, payment as Payment);
  return json({ status });
});

async function release(booking: Booking, payment: Payment) {
  if (!await moveBooking(booking.id, 'paid_held', 'performed')) throw new HttpError(409, 'gig already reported');
  await log('payments', 'gig_performed', { booking_id: booking.id });

  // Real payout only for a real Whop payment, and only with a private thread to deliver the link;
  // anything else is simulated and flagged.
  const managerThreadId = await artistManagerThreadId(booking.artist_id);
  let link: Awaited<ReturnType<typeof createPayoutLink>> | null = null;
  let reason = !payment.whop_payment_id ? 'payment was simulated' : !managerThreadId ? 'no private thread for the artist' : null;
  if (!reason) {
    try {
      link = await createPayoutLink(Number(payment.payout_usd), booking.id);
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
  }

  await setPaymentStatus(booking.id, 'held', 'released');
  await moveBooking(booking.id, 'performed', 'released');
  await log('payments', link ? 'payout_sent' : 'payout_simulated', {
    booking_id: booking.id, payout_usd: payment.payout_usd, fee_usd: payment.fee_usd,
    ...(link ? { claim_link_id: link.id } : { simulated: true, reason }),
  });

  const threadId = await bookingThreadId(booking.id);
  if (threadId) {
    await postAgentMessage(threadId,
      `Great show! ${booking.venue.name} confirmed the gig on ${when(booking.gig_date)} happened, so I released ` +
      `${usd(payment.payout_usd)} to ${booking.artist.name}: ${usd(payment.amount_usd)} minus Stagehand's 15% fee ` +
      `(${usd(payment.fee_usd)}). Thank you both, I hope to book you together again.`);
  }
  // The claim link is redeemable by whoever holds it, so it goes only to the artist's own thread.
  if (managerThreadId) {
    await postAgentMessage(managerThreadId, link
      ? `Your pay for ${booking.venue.name} is ready: ${usd(payment.payout_usd)}. Collect it on Whop` +
        `${link.expiresAt ? ` before ${when(link.expiresAt.slice(0, 10))}` : ''} and keep the link private, ` +
        `anyone who has it can claim it:\n${link.url}`
      : `Your pay for ${booking.venue.name} is released: ${usd(payment.payout_usd)}. The Stagehand team will send it to you shortly.`);
  }
  return 'released';
}

async function refund(booking: Booking, payment: Payment) {
  if (!await moveBooking(booking.id, 'paid_held', 'refunded')) throw new HttpError(409, 'gig already reported');
  await log('payments', 'gig_no_show', { booking_id: booking.id });

  // A real Whop payment gets a real refund; if Whop refuses, put the booking back and surface the error.
  if (payment.whop_payment_id) {
    try {
      await refundPayment(payment.whop_payment_id, booking.id);
    } catch (e) {
      await moveBooking(booking.id, 'refunded', 'paid_held');
      await log('payments', 'refund_failed', { booking_id: booking.id, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }
  await setPaymentStatus(booking.id, 'held', 'refunded');
  await log('payments', payment.whop_payment_id ? 'refund_issued' : 'refund_simulated', {
    booking_id: booking.id, amount_usd: payment.amount_usd, whop_payment_id: payment.whop_payment_id,
    ...(!payment.whop_payment_id && { simulated: true }),
  });

  const threadId = await bookingThreadId(booking.id);
  if (threadId) {
    await postAgentMessage(threadId,
      `${booking.venue.name} reported that the gig on ${when(booking.gig_date)} didn't happen, so I refunded the full ` +
      `${usd(payment.amount_usd)} to ${booking.venue.name}. ${booking.artist.name}, if that's not what happened, ` +
      `reply here and I'll look into it.`);
  }
  return 'refunded';
}
