import { WhopClient, WhopEnvironment } from "@whop/sdk";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { config, requireEnv } from "./env";

let client: WhopClient | undefined;

export function whop(): WhopClient {
  client ??= new WhopClient({
    token: requireEnv("WHOP_API_KEY"),
    environment: process.env.WHOP_ENV === "production" ? WhopEnvironment.Production : WhopEnvironment.Sandbox,
  });
  return client;
}

export interface CheckoutRequest {
  title: string;
  amountUsd: number;
  /** Echoed back on the payment webhook; use it to find the contract/match. */
  metadata: Record<string, string>;
}

/** Creates a one-time Whop checkout and returns its hosted purchase URL. */
export async function createCheckout({ title, amountUsd, metadata }: CheckoutRequest): Promise<string> {
  const checkout = await whop().checkoutConfigurations.create({
    account_id: requireEnv("WHOP_BUSINESS_ID"),
    metadata,
    redirect_url: `${config.appUrl}/thanks`,
    plan: {
      title,
      plan_type: "one_time",
      initial_price: amountUsd,
      currency: "usd",
      metadata,
    },
  });
  if (!checkout.purchase_url) throw new Error("Whop returned no purchase_url");
  return checkout.purchase_url;
}

/** Verifies the Standard Webhooks signature and returns the parsed event body. */
export function verifyWhopWebhook(rawBody: string, headers: Headers): Record<string, unknown> {
  return unwrapWebhook<Record<string, unknown>>(rawBody, {
    headers: Object.fromEntries(headers.entries()),
    key: process.env.WHOP_WEBHOOK_SECRET,
  });
}
