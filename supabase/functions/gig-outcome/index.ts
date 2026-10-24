// { booking_id, performed } → { status }. The venue reports the gig.
// performed → booking performed; the artist's payout (amount minus our fee) goes out as a Whop claim
// link in the artist's own manager thread, and only once Whop has created it are the booking and
// payment released. If Whop refuses (e.g. funds not cleared yet) the money stays held, the booking
// stays performed, the artist is told it is not paid yet, and the payout is flagged for a human.
// Calling again with performed=true on a performed booking retries the payout (the venue, or an
// internal call with the service role key).
// no-show → full Whop refund to the venue, booking and payment refunded.
// The booking moves first with a conditional update, so a double tap can't pay or refund twice.
import { serve, json, HttpError } from '../_shared/cors.ts';
import { db, getCaller, log, postAgentMessage } from '../_shared/db.ts';
import {
  artistManagerThreadId, bookingThreadId, leasePayment, loadBooking, moveBooking, setPaymentStatus, usd, when, type Booking,
} from '../_shared/payments/booking.ts';
import { createPayoutLink, refundPayment, venuePaymentProblem } from '../_shared/payments/whop.ts';

type Payment = {
  amount_usd: number; fee_usd: number; payout_usd: number; whop_payment_id: string | null; status: string; updated_at: string;
};

// Demo mode (default) lets the venue report before the gig date; DEMO_MODE=false enforces it.
const demoMode = () => Deno.env.get('DEMO_MODE') !== 'false';
const todayInNewYork = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const isServiceCall = (req: Request) =>
  req.headers.get('Authorization') === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

serve(async req => {
  const body = await req.json();
  if (typeof body.performed !== 'boolean') throw new HttpError(400, 'performed (boolean) required');
  const booking = await loadBooking(body.booking_id);
  if (!isServiceCall(req) && (await getCaller(req)).venue?.id !== booking.venue_id) {
    throw new HttpError(403, 'only the venue can report the gig');
  }
  const retry = booking.status === 'performed' && body.performed;
  if (booking.status !== 'paid_held' && !retry) throw new HttpError(409, `booking is ${booking.status}, not paid_held`);
  if (!retry && !demoMode() && booking.gig_date && booking.gig_date > todayInNewYork()) {
    throw new HttpError(409, 'the gig has not happened yet');
  }
  const { data: payment } = await db.from('payments')
    .select('amount_usd, fee_usd, payout_usd, whop_payment_id, status, updated_at').eq('booking_id', booking.id).maybeSingle();
  if (payment?.status !== 'held') throw new HttpError(409, 'no held payment for this booking');

  const status = body.performed ? await release(booking, payment as Payment, !retry) : await refund(booking, payment as Payment);
  return json({ status });
});

async function release(booking: Booking, payment: Payment, firstReport: boolean) {
  if (firstReport) {
    if (!await moveBooking(booking.id, 'paid_held', 'performed')) throw new HttpError(409, 'gig already reported');
    await log('payments', 'gig_performed', { booking_id: booking.id });
  } else {
    // A retry must not overlap an attempt that may still be running (edge functions stop well within 5 min),
    // nor follow one that already created a link but crashed before recording it.
    if (Date.now() - Date.parse(payment.updated_at) < 5 * 60_000) {
      throw new HttpError(409, 'a payout attempt ran in the last 5 minutes, try again shortly');
    }
    const { data: sent } = await db.from('agent_log').select('id')
      .eq('action', 'payout_sent').eq('detail->>booking_id', booking.id).limit(1);
    if (sent?.length) {
      await log('payments', 'payout_needs_review', { booking_id: booking.id, reason: 'a payout link was already created', needs_human: true });
      throw new HttpError(409, 'a payout was already sent for this booking, needs review');
    }
  }
  const attempt = await leasePayment(booking.id, payment.updated_at);
  if (!attempt) throw new HttpError(409, 'payout already in progress');
  const threadId = await bookingThreadId(booking.id);
  const managerThreadId = await artistManagerThreadId(booking.artist_id);
  const demo = !payment.whop_payment_id; // WHOP_SIMULATE: no real money was ever charged
  const payout = usd(payment.payout_usd);

  // A real payment is released only once Whop has created the artist's claim link.
  let link: Awaited<ReturnType<typeof createPayoutLink>> | null = null;
  if (!demo) {
    let reason = managerThreadId ? await venuePaymentProblem(payment.whop_payment_id!) : 'no private thread for the artist';
    if (!reason) {
      try {
        link = await createPayoutLink(Number(payment.payout_usd), booking.id, attempt);
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
      }
    }
    if (!link) {
      await log('payments', 'payout_pending', { booking_id: booking.id, payout_usd: payment.payout_usd, reason, needs_human: true });
      if (firstReport) {
        if (threadId) {
          await postAgentMessage(threadId,
            `Thanks for confirming the show on ${when(booking.gig_date)}, ${booking.venue.name}. ${booking.artist.name}'s ` +
            `${payout} is still held safely: Whop hasn't completed the transfer yet, so I haven't marked it paid. ` +
            `I've flagged it to the Stagehand team to finish.`);
        }
        if (managerThreadId) {
          await postAgentMessage(managerThreadId,
            `${booking.venue.name} confirmed your show. Your ${payout} is still held for you, untouched, but Whop hasn't ` +
            `completed the transfer yet, so it is not paid yet. I've flagged it to the Stagehand team to finish the ` +
            `transfer; your collection link will appear in this chat when it's done.`);
        }
      }
      return 'performed';
    }
  }

  await log('payments', link ? 'payout_sent' : 'payout_simulated', {
    booking_id: booking.id, payout_usd: payment.payout_usd, fee_usd: payment.fee_usd,
    ...(link ? { claim_link_id: link.id } : { simulated: true }),
  });
  await setPaymentStatus(booking.id, 'held', 'released');
  await moveBooking(booking.id, 'performed', 'released');

  const demoNote = demo ? ' (demo mode: no real money moved)' : '';
  if (threadId) {
    await postAgentMessage(threadId,
      `Great show! ${booking.venue.name} confirmed the gig on ${when(booking.gig_date)}, and ${booking.artist.name}'s ` +
      `${payout} is paid out${demoNote}: ${usd(payment.amount_usd)} minus Stagehand's 15% fee (${usd(payment.fee_usd)}). ` +
      `Thank you both, I hope to book you together again.`);
  }
  // The claim link is redeemable by whoever holds it, so it goes only to the artist's own thread.
  if (managerThreadId) {
    await postAgentMessage(managerThreadId, link
      ? `Your pay for ${booking.venue.name} is ready: ${payout}. Collect it on Whop` +
        `${link.expiresAt ? ` before ${when(link.expiresAt.slice(0, 10))}` : ''} and keep the link private, ` +
        `anyone who has it can claim it:\n${link.url}`
      : `Your pay for ${booking.venue.name} is released: ${payout}${demoNote}.`);
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
