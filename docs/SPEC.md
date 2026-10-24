# Stagehand: build spec

Oct 24, 2026 · Zero-Human Company Hackathon (Terac × Whop), NYC · code freeze 17:30

## Product

Stagehand books emerging New York artists into bars and venues. Mack, our AI booking manager, onboards both sides by chat or voice, keeps their availability in a calendar, recommends artists to venues the moment their calendars line up, negotiates each booking in a shared chat, and holds the venue's payment until the gig happens. Verified bookers on Terac vet artist profiles. The venue pays through Whop; we keep a 15% fee.

## The flow

1. **Sign up** (artist or venue) with the existing forms.
2. **Intake with Mack, required, right after signup.** The user picks chat or voice and can switch at any moment; both write to the same thread. Mack collects availability (dates or weekly slots, times), start date, set length, pay (artist rate or venue budget), and what they want out of it (venue: capacity and the music they want). It saves everything to the profile and the `availability` table, then marks `intake_completed_at`.
3. **Calendar**: the user sees their availability on a calendar and can add, edit or delete slots.
4. **Instant match**: when a venue finishes intake or edits its calendar, `match` ranks artists by overlapping availability, genres and budget, writes `suggestions`, and Mack posts the top picks in the venue's manager thread.
5. **Bookings tab, venue**: suggestion cards (video, genres, "Verified by expert bookers" badge, reason, matching slot) with Yes / No. Yes creates a `booking` and a booking thread (artist + venue + Mack).
6. **Inbox, both sides**: a messaging app. Mack's manager thread is pinned on top, then one thread per booking. In a booking thread the artist and venue talk directly and Mack mediates the date, time, set length and pay, writing the agreed terms on the booking.
7. **Confirm**: both press Confirm → `confirmed`.
8. **Pay**: the venue pays on Whop's checkout → `paid_held` (money held, tracked in `payments`).
9. **After the gig**: the venue says it happened → `performed` → `released` (artist paid minus fee). No-show → `refunded` through Whop.
10. **Vetting, in parallel**: when an artist finishes intake, their profile is sent to Terac. Expert bookers answer on our `/review/:token` page; the verdict sets `artists.vetting` and the badge.

Every agent action goes to `agent_log`; `/live` shows it for the demo.

## Shared context between chat and voice

The context lives in the database, not in the model. Each thread's `messages` hold text and voice turns (`channel`). Text: Mack's text agent loads profile + availability + `mack_notes` + the last 40 messages and replies. Voice: `voice-session` builds the OpenAI `gpt-live-1` instructions from the same context and the same Mack prompt; every voice turn is saved with `channel = 'voice'`, then the text agent processes the new turns to save any data (only the text agent has tools). Switching modes keeps the conversation.

## Architecture

- **Hosting**: Lovable hosts the web app, and Lovable Cloud (Supabase project `luxpdpyxsywmggvewars`) hosts Postgres, Auth, Storage (`media`, private, signed URLs), Realtime and our Edge Functions (Deno). This repo is synced two-way with Lovable.
- **Web app**: built in Lovable (TanStack Start, React, Tailwind). Backend actions go through `src/data/api.ts`: each export starts as a Lovable server function (`src/data/backend.server.ts`) and is switched to its Edge Function once that works.
- **Models**: Mack's text agent through an OpenAI-compatible endpoint (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`): the Lovable AI gateway while the app runs on Lovable, OpenAI otherwise. Voice: OpenAI `gpt-live-1` over WebRTC in the browser (from our v3 voice lab).
- **Whop**: hosted checkout, webhook, refunds. No native hold on hosted checkout: "held" is tracked in `payments`; the artist payout is a Whop transfer, simulated in the demo.
- **Terac**: REST API `https://terac.com/api/external/v2` (Bearer key) or the MCP `https://terac.com/api/mcp`. Answers take hours: launch the first request early.
- **Mobile-first**: everything usable on a phone; voice needs a tap to start (mic and audio) and HTTPS.

## Edge functions (the contract between the UI and the backend)

| Function | Input → output | Owner |
| --- | --- | --- |
| `mack-start` | `{party: 'artist'\|'venue'}` → `{thread_id}`; creates the manager thread and Mack's opener if empty | Mack |
| `mack-chat` | `{thread_id, content}` → `{message_id}`; saves the user's message, Mack replies into the thread (arrives by Realtime) | Mack |
| `voice-session` | `{thread_id, sdp}` → `{sdp, greeting}` | Mack |
| `voice-turns` | `{thread_id, turns: [{speaker: 'user'\|'agent', text}]}` → `{ok}` | Mack |
| `match` | `{venue_id}` → `{suggestions}` | Matching |
| `suggestion-decision` | `{suggestion_id, decision: 'yes'\|'no'}` → `{booking_id, thread_id}` or `{}` | Matching |
| `booking-confirm` | `{booking_id, decline?: boolean}` → `{status}` | Matching |
| `whop-checkout` | `{booking_id}` → `{checkout_url}` | Payments |
| `whop-webhook` | Whop events (no JWT) | Payments |
| `gig-outcome` | `{booking_id, performed: boolean}` → `{status}` | Payments |
| `expert-review` | GET `?token=` → `{artist, video_url}`; POST `{token, verdict, room_fit, note}` → `{ok}` (no JWT) | Vetting |
| `terac-submit`, `terac-poll` | internal / cron | Vetting |

Direct writes from the UI (RLS-protected): own `artists` / `venues` row, own `availability`, file uploads to `media/{user_id}/…`. Everything else goes through a function.

## Booking statuses

`negotiating → confirmed → paid_held → performed → released`, with `refunded` (no-show) and `cancelled` (declined). Functions with the service role are the only writers.

## Owners

| # | Person | Owns |
| --- | --- | --- |
| 1 | Lovable | All UI (prompt `docs/prompts/1-lovable.md`) |
| 2 | Mack (voice + chat) | `mack-*`, `voice-*`, `supabase/functions/_shared/mack/` (prompt `2-mack.md`) |
| 3 | Matching and bookings | `match`, `suggestion-decision`, `booking-confirm` (prompt `3-matching-bookings.md`) |
| 4 | Payments | `whop-*`, `gig-outcome` (prompt `4-payments.md`) |
| 5 | Base, vetting, demo | repo + Supabase setup, `_shared/`, seed, `expert-review`, `terac-*`, export integration, demo run (prompt `5-base-vetting-demo.md`) |

## Rules

- The live schema is Lovable's (`drizzle/migrations/`); `docs/reference/stagehand-contract.sql` is the reference for names, and `HACKATHON_HANDOFF.md` lists the differences. Schema changes are asked in the team chat and applied through Lovable.
- Each person works in their own function folders. `_shared/` changes are small, additive, announced.
- Every agent action: `log(agent, action, detail)` into `agent_log`.
- Secrets in `.env` / Supabase secrets, never in git (the repo is public).
- One branch per person, merged into `main` at least every 45 minutes (`CLAUDE.md`).
- If a gate slips, cut a stretch goal, never the happy path. Demo with seeded data if the full flow hasn't run by 17:00.

## Demo (3 minutes)

1. A venue signs up on a phone; Mack runs intake by voice, then the user switches to chat mid-conversation and Mack continues.
2. The calendar fills; Mack instantly recommends three artists free on those nights.
3. One artist shows the "Verified by expert bookers" badge (Terac).
4. The venue says yes; the booking chat opens; Mack settles date and pay; both confirm.
5. The venue pays through Whop; the booking shows "paid, held".
6. The gig is marked done; payout released minus 15%; we show the refund path.
7. `/live`: every decision made by agents.
