# Prompt 3 — Matching and bookings

> Paste into Claude Code at the root of the repo, on your branch (see `CLAUDE.md`).

---

You build Stagehand's matching and the booking lifecycle up to confirmation. Read `docs/SPEC.md` and `docs/reference/stagehand-contract.sql`. You own `supabase/functions/match`, `suggestion-decision`, `booking-confirm`. Use the helpers in `supabase/functions/_shared/` (`serve`, `getCaller`, `log`, `postAgentMessage`). Code freeze 17:30. Rules, owners and git flow: `AGENTS.md`.

## `match` `{ venue_id }` → `{ suggestions }`

Called by Mack when a venue completes intake, and by the UI after a calendar change.
- Expand availability over the next 6 weeks for the venue and every artist with `intake_completed_at` (dated rows as is; weekly rows on each matching weekday), and find overlapping evening slots (at least the venue's `set_length_min`, default 60 min).
- Score 0–100: availability overlap (must have at least one slot), genre overlap with the venue's genres, pay fit (`rate_usd` ≤ `budget_usd`), borough proximity, `vetting = 'verified'` bonus.
- Keep the top 5 artists not already suggested to this venue; for each, the earliest overlapping slot (`slot_date`, `slot_start`) and a one-line reason a venue owner would like to read ("Plays jazz and soul, free Fridays 9 pm, $150 within your $200 budget, verified by NYC bookers").
- Upsert `suggestions` (status `suggested`), `log('matching', 'suggestions_made', …)`, and return them. Fast: this runs while the user waits (aim under 2 s).

## `suggestion-decision` `{ suggestion_id, decision }`

Caller must own the venue.
- `no` → status `declined`, log.
- `yes` → status `accepted`; create a `booking` (status `negotiating`, `gig_date` / `start_time` from the slot, `set_length_min` from the venue, `offer_usd` = the artist's rate within the venue's budget); create the booking thread (`kind = 'booking'`, `booking_id`); `postAgentMessage` an intro from Mack to both (who they are, the proposed slot and pay, ask the artist to confirm the date); post a short heads-up in the artist's manager thread ("Pianos wants to book you, check your inbox"); log. Return `{ booking_id, thread_id }`.

## `booking-confirm` `{ booking_id, decline? }`

Caller must be the artist or the venue of the booking; booking must be `negotiating`.
- decline → `cancelled`, Mack posts a short, kind closing message.
- confirm → set `artist_confirmed` or `venue_confirmed` (requires `gig_date` and `offer_usd`); when both are true → `confirmed`, Mack posts the summary and tells the venue to pay and hold. A change of terms by Mack (`set_booking_terms`) resets both confirmations: coordinate the column names with the Mack teammate.
- Log every step.

## Done when

With seeded data: `match` returns ranked suggestions with reasons in under 2 s; a yes creates a booking and its thread with Mack's intro; both confirmations move the booking to `confirmed`. Test each function with `curl` against the deployed project and a seeded user's JWT.
