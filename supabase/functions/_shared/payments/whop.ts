// Whop calls for the payments slice (whop-checkout, whop-webhook, gig-outcome).
// WHOP_ENV=sandbox|production picks the API: keys only work against their own environment.
// WHOP_SIMULATE=true skips Whop for new checkouts so the happy path runs without keys.
import { WhopClient, WhopEnvironment } from 'npm:@whop/sdk@2.6.0';
import { unwrapWebhook } from 'npm:@whop/sdk@2.6.0/helpers';
import { HttpError } from '../cors.ts';

export const simulate = () => Deno.env.get('WHOP_SIMULATE') === 'true';

let client: WhopClient | undefined;
const whop = () =>
  client ??= new WhopClient({
    token: Deno.env.get('WHOP_API_KEY'),
    environment: Deno.env.get('WHOP_ENV') === 'production' ? WhopEnvironment.Production : WhopEnvironment.Sandbox,
  });

function companyId() {
  const id = Deno.env.get('WHOP_COMPANY_ID');
  if (!id) throw new Error('WHOP_COMPANY_ID is not set');
  return id;
}

// One-time hosted checkout. Its metadata is copied onto the payment, so the webhook finds the booking.
export async function createCheckout(o: { bookingId: string; title: string; amountUsd: number; redirectUrl?: string }) {
  const checkout = await whop().checkoutConfigurations.create({
    account_id: companyId(),
    metadata: { booking_id: o.bookingId },
    ...(o.redirectUrl && { redirect_url: o.redirectUrl }),
    plan: { title: o.title, plan_type: 'one_time', initial_price: o.amountUsd, currency: 'usd' },
  });
  if (!checkout.purchase_url) throw new Error('Whop returned no purchase_url');
  return { id: checkout.id, url: checkout.purchase_url };
}

// Only the fields we read from a payment.* event (see Whop.Payment for the rest).
export type WhopEvent = {
  id: string;
  type: string;
  data: {
    id: string;
    metadata?: Record<string, unknown> | null;
    checkout_configuration_id?: string | null;
    total?: { amount: string; currency: string } | null;
  };
};

// Standard Webhooks signature check on the raw body. Bad or missing signature → 401.
export function verifyWebhook(raw: string, headers: Headers): WhopEvent {
  const key = Deno.env.get('WHOP_WEBHOOK_SECRET');
  if (!key) throw new Error('WHOP_WEBHOOK_SECRET is not set');
  try {
    return unwrapWebhook<WhopEvent>(raw, { headers: Object.fromEntries(headers), key });
  } catch (e) {
    throw new HttpError(401, `invalid webhook signature: ${e instanceof Error ? e.message : e}`);
  }
}

// Full refund of a payment (pay_…). Whop won't refund more than was paid, so a retry can't double it.
export async function refundPayment(paymentId: string, bookingId: string) {
  await whop().payments.refund({ id: paymentId, metadata: { booking_id: bookingId } });
}

// Before paying the artist: is the venue's payment still paid, unrefunded, and real in this
// Whop environment (a sandbox payment is not found by production keys)? null = good, else why not.
export async function venuePaymentProblem(paymentId: string): Promise<string | null> {
  try {
    const p = await whop().payments.retrieve({ id: paymentId });
    if (p.status !== 'paid') return `venue payment is ${p.status} on Whop`;
    if (p.refunded_at) return 'venue payment was refunded on Whop';
    return null;
  } catch (e) {
    return `venue payment not found on Whop (${Deno.env.get('WHOP_ENV') ?? 'sandbox'}): ${e instanceof Error ? e.message : e}`;
  }
}

// Artists have no Whop account in our schema, so the payout is a claim link they open to collect.
// Anyone holding the link can claim it: share it only where the artist alone can read it.
// `attempt` keys the request per payout attempt: the SDK's own retries reuse it, a later
// attempt after a refusal (e.g. funds not cleared yet) gets a fresh one.
export async function createPayoutLink(amountUsd: number, bookingId: string, attempt: string, days = 14) {
  const link = await whop().transfers.create(
    {
      type: 'claim_link',
      amount: amountUsd,
      origin_id: companyId(),
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    },
    { idempotencyKey: `payout-${bookingId}-${attempt}` },
  );
  if (link.object !== 'claim_link') throw new Error(`unexpected transfer object: ${link.object}`);
  return { id: link.id, url: link.claim_url, expiresAt: link.expires_at };
}
