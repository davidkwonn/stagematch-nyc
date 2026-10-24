# Stagehand — rules for every teammate and every agent

Stagehand books emerging NYC artists into bars and venues. Mack, the AI booking manager, onboards both sides by chat or voice, keeps their calendar, recommends artists, negotiates each booking, and holds the venue's payment (Whop) until the gig. Verified bookers on Terac vet artist profiles.

- Spec: `docs/SPEC.md`. Your prompt: `docs/prompts/`. Lovable's architecture rules: `AGENTS.md`. Schema differences: `HACKATHON_HANDOFF.md`.
- This repo is synced two-way with Lovable. Whatever lands on `main` appears in Lovable and is deployed.

## Where things run

- Lovable hosts everything: the web app (TanStack Start), the database and auth (Lovable Cloud, Supabase project `luxpdpyxsywmggvewars`), and our Edge Functions (deployed from `supabase/functions/`).
- Database: the live schema is Lovable's (`drizzle/migrations/`). `docs/reference/stagehand-contract.sql` is the reference for names only. Differences:
  - `bookings.status` is text, guarded by a trigger with the `booking_status` values.
  - Legacy `bookings.offer_amount`, `swipes` and `booking_messages` exist: never use them.
  - NOT NULL on `artists.birthday` and on venues `address`, `borough`, `phone`, `email`.
  - RPC `settle_booking_confirmation(_booking_id, _decline)` does atomic two-party confirmation.
- Never run `supabase db push` or `supabase link`, and never add files under `supabase/migrations/`. A schema change is asked in the team chat; the base owner applies it through Lovable.
- Secrets live in Lovable Cloud → Secrets (see `.env.example`). Edge functions get `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `LOVABLE_API_KEY` automatically.

## The backend boundary

- The UI calls only `src/data/api.ts`. Each export is tagged `// edge function: <name>`, and today it calls a Lovable server function (`handleAction` in `src/data/backend.server.ts`), which keeps the demo running.
- Build your Edge Function, check it on the deployed project, then replace only the body of your export in `api.ts` with `supabase.functions.invoke('<name>', { body })`. Return exactly the shape the current implementation returns. Don't touch other exports or `backend.server.ts`.

## Who owns what

| # | Slice | Branch | Owns |
| --- | --- | --- | --- |
| 1 | UI (Lovable) | edited in Lovable, lands on `main` | the web app |
| 2 | Mack: chat + voice | `mack` | `supabase/functions/mack-*`, `voice-*`, `_shared/mack/`, `src/features/voice/voice-client.ts`, `src/data/mack*.ts` |
| 3 | Matching and bookings | `matching` | `match`, `suggestion-decision`, `booking-confirm` |
| 4 | Payments (Whop) | `payments` | `whop-checkout`, `whop-webhook`, `gig-outcome` |
| 5 | Base, vetting (Terac), demo | `base` | `_shared/` (except `mack/`), `supabase/config.toml`, `expert-review`, `terac-*`, `docs/DEMO.md` |

Work only in your own folders. `_shared/cors.ts`, `_shared/db.ts`, `_shared/ai.ts` are shared: small additive changes, announced in the chat.

## Git

- Create your branch from `main` (`git switch -c <branch>`), commit small, push often.
- Merge into `main` at least every 45 minutes: `git pull --rebase origin main`, then a PR or a fast-forward merge. Every merge redeploys: `main` always works.
- Never force-push and never rewrite commits already pushed to `main`: it rewrites history in Lovable.
- Conventional commits: `feat(mack): …`, `fix(payments): …`.
- The repo is public: no secret in git.

## Backend conventions

- Supabase Edge Functions (Deno, TypeScript), one folder per function under `supabase/functions/`.
- Start every function with `serve()` from `_shared/cors.ts`; identify the user with `getCaller(req)`; check thread access with `assertThreadParty`. A bearer equal to `SUPABASE_SERVICE_ROLE_KEY` is a trusted internal call (`invoke()`): skip the caller check.
- Every agent decision: `log(agent, action, detail)` → `agent_log` (shown on `/live`).
- Mack speaks with `postAgentMessage(thread_id, content)`. Functions call each other with `invoke(name, body)`.
- Functions without a user JWT (webhooks, cron, public pages) are listed with `verify_jwt = false` in `supabase/config.toml`.
- Each external service has a `*_SIMULATE` fallback so the happy path runs before the real integration lands; every simulated step is flagged `simulated: true` in `agent_log`.
- Type-check before pushing: `deno check supabase/functions/*/index.ts`.

## Deadline

Code freeze 17:30. If a gate slips, cut a stretch goal, never the happy path.
