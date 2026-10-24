# Stagehand

**Mack, an AI booking manager, books emerging NYC artists into bars and small venues, end to end.**

Built in one day at the Zero-Human Company Hackathon NYC (Terac × Whop), October 24, 2026.

| | |
| --- | --- |
| **App** | https://gigmatch-nyc-stage.lovable.app |
| **Live agent activity** (no login) | https://gigmatch-nyc-stage.lovable.app/live |
| **Admin: Mack's sourcing and outreach center** | https://gigmatch-nyc-stage.lovable.app/admin (login below) |

## Judges: how to open the admin dashboard

1. Go to https://gigmatch-nyc-stage.lovable.app/auth and sign in with:
   - Email: `judges@stagehand-demo.com`
   - Password: `Stagehand-Demo-2026!`
2. The app may send you to onboarding (this account has no artist or venue profile). Ignore it and type https://gigmatch-nyc-stage.lovable.app/admin in the address bar.
3. You'll see the funnel (pages searched → leads accepted → contacted → replied → signed up), the artist and venue leads Mack found, the emails Mack drafted, and every run. **Run artists now** / **Run venues now** start a new search. Sending is in simulation mode: no email leaves.

To try the product itself, sign up as a venue or an artist on the app and talk to Mack, by voice or chat.

## What it does

1. **Sign up** as an artist or a venue.
2. **Intake with Mack, by voice or chat, on the same conversation.** Tap the button and talk: Mack asks for your available nights, start date, set length, pay (artist rate or venue budget), capacity and the music you want, and saves them to your profile and calendar as you speak. You can switch to chat mid-conversation; Mack continues with the full context.
3. **Instant match.** When a venue finishes intake, Mack ranks artists by shared evenings over the next 6 weeks, genres, pay fit, borough and expert verification, posts the top 3 in the conversation and pitches the best one by voice.
4. **Booking chat.** The venue taps Yes: a three-way thread opens (artist, venue, Mack). Mack mediates date, time, set length and pay; both sides press Confirm.
5. **Pay and hold (Whop).** The venue pays; the money is held until the show. After the gig the venue reports "It happened" (the artist is paid, minus our 15% fee) or "No-show" (the venue is refunded).
6. **Expert vetting (Terac).** When an artist finishes intake, their profile goes to NYC bookers on Terac; the verdict sets the "Verified by expert bookers" badge.
7. **Mack recruits supply and demand on his own.** The outreach center searches the public web with Exa (Bandcamp and SoundCloud artist pages, NYC bars with a published booking email), filters leads in code, and drafts one personal invitation per lead.
8. **Every agent decision is logged** and shown live on `/live`.

## Test and simulation modes

- **Payments:** Whop sandbox, with `WHOP_SIMULATE` on for the demo; simulated steps are flagged `simulated` in the agent log.
- **Vetting:** a real Terac request is live (one NYC booker reviewing five artists); `TERAC_SIMULATE` covers the rest.
- **Outreach:** `OUTREACH_SIMULATE` is on: drafts are stored and marked "simulated", nothing is sent. Only public booking contacts are used, every draft has an opt-out, and opt-outs go to a `do_not_contact` list.

## How it's built

- **Web app:** TanStack Start, React and Tailwind, built in [Lovable](https://lovable.dev) and hosted there. The UI calls the backend only through `src/data/api.ts`.
- **Backend:** Lovable Cloud (Supabase: Postgres, Auth, Storage, Realtime), app server functions in `src/data/*.server.ts`, and Supabase Edge Functions in `supabase/functions/`.
- **Mack, one brain for chat and voice** (`src/data/mack.server.ts`, `src/data/mack-prompt.ts`): each turn builds the same context from the database (profile without contact details, calendar, what is still missing, notes, bookings, last messages) and a model call returns the reply plus the facts to save.
- **Voice** (`src/features/voice/voice-client.ts`, `src/data/voice.server.ts`): OpenAI GPT-Live (`gpt-live-1`, male voice `meridian`) over WebRTC from the browser. Every voice turn is saved in the same thread as the chat. When the voice model delegates, or after each user turn, Mack's backend saves the facts and tells the voice what was saved and what to say.
- **Matching:** `src/data/matching.ts`.
- **Payments:** `supabase/functions/whop-checkout`, `whop-webhook`, `gig-outcome`.
- **Vetting:** `supabase/functions/terac-submit`, `terac-poll`, and the public review page `/review/:token`.
- **Outreach:** `supabase/functions/outreach-run` (cron every 10 minutes), `outreach-optout`, the admin page `src/routes/admin.tsx`; design in `docs/outreach/artist-sourcing-brief.md`.

## Repo map

| Path | What |
| --- | --- |
| `src/routes/` | Pages (intake, calendar, inbox, home, profile, `/live`, `/admin`, `/review/:token`) |
| `src/data/` | Data layer, server functions, Mack, voice, matching |
| `src/features/` | Chat and voice UI |
| `supabase/functions/` | Edge Functions (payments, vetting, outreach, health) |
| `drizzle/migrations/` | Live database schema |
| `docs/SPEC.md` | Product spec |
| `docs/DEMO.md` | Demo runbook |
| `docs/prompts/` | The prompt each teammate's coding agent started from |
| `docs/outreach/`, `docs/payments/` | SQL and briefs for outreach and payments |
| `CLAUDE.md`, `AGENTS.md` | Rules for teammates and coding agents |

## Run locally

```sh
npm i
npm run dev
```

The app reads the public Supabase values from `.env`. Server-side keys (AI, OpenAI, Whop, Terac, Exa) live only in Lovable Cloud secrets; see `.env.example` for the list. Type-check with `npx tsc --noEmit`, test with `npm test`.

This repository is synced two-way with the Lovable project: commits on `main` appear in Lovable and are deployed from there.
