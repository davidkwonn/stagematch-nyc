# Prompt 4 — Payments with Whop

> Paste into Claude Code at the root of the repo, on your branch (see `CLAUDE.md`).

---

You build Stagehand's payments: the venue pays through Whop when a booking is confirmed, the money is held until the gig, then the artist is paid minus our 15% fee, or the venue is refunded on a no-show. Read `docs/SPEC.md` and `docs/reference/stagehand-contract.sql`. You own `supabase/functions/whop-checkout`, `whop-webhook`, `gig-outcome`. Use `_shared/` helpers (`serve`, `getCaller`, `log`, `postAgentMessage`, `FEE_RATE`). Reference from the old draft: `docs/reference/whop.ts`. Whop docs: https://docs.whop.com. Code freeze 17:30. Rules, owners and git flow: `AGENTS.md`.

## Facts to build around

- Whop's hosted checkout has no hold-then-capture: the venue pays for real, "held" is our `payments.status`, the refund on no-show is a real Whop refund, and the payout to the artist is a Whop transfer (simulated in the demo if the balance isn't available yet; say so on stage).
- Hackathon rule: sandbox sales don't count. Build and test in sandbox, switch to production keys before sharing links.
- Ask the Whop team on site whether hold and capture can be enabled; keep the design above either way.

## `whop-checkout` `{ booking_id }` → `{ checkout_url }`

Caller must be the booking's venue; booking must be `confirmed`. Amount = `offer_usd`; `fee_usd` = amount × `FEE_RATE`; `payout_usd` = amount − fee. Create a one-time Whop checkout with metadata `{ booking_id }` and a redirect to `APP_URL` (the booking thread); upsert `payments` (`pending`, `whop_checkout_id`, `checkout_url`); log. `WHOP_SIMULATE=true`: skip Whop, mark held immediately (same effects as the webhook below).

## `whop-webhook` (no JWT)

Verify the signature with `WHOP_WEBHOOK_SECRET`. On payment succeeded: find the payment by metadata `booking_id` (fallback: `whop_checkout_id`), set `held` + `whop_payment_id`, booking → `paid_held`, Mack posts in the booking thread ("Payment received and held. You're booked for Fri Nov 7 at 9 pm."), log. Idempotent: a replayed event changes nothing.

## `gig-outcome` `{ booking_id, performed }`

Caller must be the booking's venue; booking must be `paid_held` (allow before the gig date in demo mode).
- performed → booking `performed` then `released`; payment `released`; transfer `payout_usd` to the artist (or simulate, flagged in `agent_log`); Mack congratulates both and states the payout.
- no-show → Whop refund of the payment; booking and payment `refunded`; Mack informs both.
- Log every step.

## Done when

On the deployed project: a confirmed booking gets a working Whop checkout link on a phone, the webhook moves it to `paid_held`, and `gig-outcome` releases one booking and refunds another, each visible in the booking thread and in `agent_log`.
