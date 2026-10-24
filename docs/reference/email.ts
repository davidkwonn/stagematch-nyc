import { Resend } from "resend";
import { config, requireEnv } from "./env";
import { db } from "./db";

let client: Resend | undefined;

function resend(): Resend {
  client ??= new Resend(requireEnv("RESEND_API_KEY"));
  return client;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  venueId?: string;
  artistId?: string;
  matchId?: string;
}

/**
 * Sends (or, while DRY_RUN is on, only records) an email and logs it to outreach_messages.
 * Cold outreach rules: honest sender, low volume, one follow-up max, and an opt-out line.
 */
export async function sendEmail(email: OutboundEmail): Promise<{ status: "sent" | "dry_run" | "failed"; error?: string }> {
  const body = `${email.text}\n\n—\nCorePower is an AI booking agent for emerging NYC artists. Reply "stop" and we won't contact you again.`;
  let status: "sent" | "dry_run" | "failed" = "dry_run";
  let providerId: string | undefined;
  let error: string | undefined;

  if (!config.dryRun) {
    const result = await resend().emails.send({
      from: requireEnv("EMAIL_FROM"),
      to: email.to,
      subject: email.subject,
      text: body,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
    if (result.error) {
      status = "failed";
      error = result.error.message;
    } else {
      status = "sent";
      providerId = result.data?.id;
    }
  }

  await db().from("outreach_messages").insert({
    channel: "email",
    direction: "outbound",
    to_address: email.to,
    subject: email.subject,
    body,
    status,
    provider_id: providerId ?? null,
    error: error ?? null,
    venue_id: email.venueId ?? null,
    artist_id: email.artistId ?? null,
    match_id: email.matchId ?? null,
  });

  return { status, error };
}
