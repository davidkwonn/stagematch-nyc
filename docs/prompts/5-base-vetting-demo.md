# Prompt 5 — Base, vetting (Terac) and demo

> Paste into Claude Code at the root of the repo, on branch `base`.

---

You own the shared base of Stagehand, the Terac vetting, the integration of the Lovable export, and the demo run. Read `CLAUDE.md`, `AGENTS.md`, `docs/SPEC.md` and `docs/reference/stagehand-contract.sql`. Hackathon: code freeze 17:30.

## Step 1 — Bring the base online (first 20 minutes)

The repo skeleton is already in `main`: schema, `_shared/` helpers (`serve`, `getCaller`, `assertThreadParty`, `log`, `postAgentMessage`, `invoke`, `chat` / `runWithTools`), a `health` function, `config.toml`, `.env.example`. Your job now:
- Create the team's Supabase project, `supabase link`, `supabase db push`, and check the schema applies cleanly.
- `supabase secrets set` the keys we have; deploy `health` and check it answers.
- Share the project ref, URL, anon key and service key with the team privately (public repo: no keys in git).
- Generate `supabase/functions/_shared/types.ts` with `supabase gen types typescript` and merge it to `main`.

## Step 2 — Seed (next 20 minutes)

`scripts/seed.ts` (run with `deno run -A` or `npx tsx`): creates 30 artists and 20 venues as real auth users (admin API, `example.com` emails), with genres, borough, rate or budget, `intake_completed_at` set, and availability for the next 4 weeks (mix of weekly and dated slots, evenings). Use real NYC venue names (Rockwood Music Hall, Pianos, Mercury Lounge, Smalls, Nublu, Baby's All Right, Union Pool, Barbès, Bar Lunàtico, C'mon Everybody, …). Give 10 artists `vetting = 'verified'` with a note, 5 `pending`. Idempotent (safe to re-run).

## Step 3 — Terac vetting

Terac is the human in the loop: verified NYC bookers judge whether an artist profile is bookable. Answers take hours, so **launch the first real request in the next hour**.

- Fastest path, by hand now: `claude mcp add --transport http terac https://terac.com/api/mcp`, `/mcp` to authenticate, then ask Claude to price (feasibility) and launch one opportunity: "3 experienced NYC talent buyers / music bookers review 10 emerging artist profiles; for each, open the link, answer: would you book this artist (yes/no), which rooms fit, one-line note; ~15 minutes". The task link is `APP_URL/review/<token>` from `expert_reviews` rows you create for the seeded artists.
- `terac-submit` `{ artist_id }`: inserts an `expert_reviews` row (token), sets `artists.vetting = 'pending'`, adds the artist to the open Terac opportunity (or creates one). Called by Mack when an artist completes intake.
- `expert-review` (no JWT): GET `?token=` → artist profile (no email/phone) + signed video URL; POST `{ token, verdict, room_fit, note }` → updates the row and `artists.vetting` / `vetting_note`, logs `vetting_verdict`.
- `terac-poll` (cron, `CRON_SECRET`): reads submissions for open opportunities (`GET /opportunities/{id}/submissions`), approves completed ones, logs.
- API: base `https://terac.com/api/external/v2`, `Authorization: Bearer TERAC_API_KEY`, OpenAPI at `https://terac.com/api/external/v2/openapi.json`, flow: `POST /projects` → `POST /feasibility/requests` (price and ETA) → `POST /opportunities` (draft) → `POST /opportunities/{id}/launch` → `GET /opportunities/{id}/submissions` → `POST /submissions/{id}/approve`.
- `TERAC_SIMULATE=true`: verdicts generated locally after a minute, flagged `simulated` in `agent_log`.

## Step 4 — Integrate the Lovable export (when it arrives, ~15:00)

The Lovable app (TanStack Start) keeps all data access in `src/data/` and all backend actions in `src/data/api.ts`, each tagged `// edge function: <name>`. Put the app at the repo root (or `web/`), point its env to our Supabase, replace each `api.ts` body with `supabase.functions.invoke('<name>', { body })`, swap `src/features/voice/voice-client.ts` with the Mack teammate's client, and deploy (Lovable hosting or Vercel). Check signup → intake → calendar → suggestions → booking chat → pay → payout on a phone.

## Step 5 — Demo

Write `docs/DEMO.md`: the 7-step script from SPEC.md with the exact seeded accounts to use. Full dry run at 16:00 and 17:00; fix only what breaks the happy path. `/live` stays open on the projector.

**Done when**: the base is pushed and deployed, seed runs, one Terac request is live, and one full run goes from venue signup to payout.
