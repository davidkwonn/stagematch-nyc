# Stagehand demo runbook

Dry runs at 16:00 and 17:00. Fix only what breaks the happy path. Keep `/live` open on the projector.

## 1. Where things run

- **Backend: Lovable Cloud** (Supabase project `luxpdpyxsywmggvewars`). The app's own server code in `src/data/backend.server.ts` handles match, Yes/No, Confirm, the review page and `/live`. No edge function deploy is needed for the happy path.
- **Matching** is our ranking in `src/data/matching.ts`. It scores shared evenings over 6 weeks, genres, pay fit, borough and Terac verification, writes a one-line reason, and never suggests a night that is already booked. Yes and Confirm refuse past dates and double bookings.
- **Sample data** is Lovable's: 12 artists and 12 venues. Ask in Lovable for their login emails and fill the table below.
- **Secrets** go in Lovable Cloud → Secrets, never in git. Your local keys live in `.env.local`, which is ignored. The tracked `.env` holds public values only.

## 2. Before the demo (checklist)

1. **Close the review-token hole.** Paste into Lovable:
   > Add a migration: revoke select on public.expert_reviews from authenticated; then grant select (id, created_at, artist_id, terac_opportunity_id, verdict, room_fit, note) on public.expert_reviews to authenticated. Also create unique index one_open_review_per_artist on public.expert_reviews (artist_id) where verdict is null. Don't change any other table, and keep the review page working, since it reads reviews with the service role.
2. **Launch Terac** (answers take hours). The quote is already requested:
   ```bash
   npx -y deno@2 run -A --env-file=.env.local scripts/terac-launch.ts status bm0gd438ua2kes9f3adwim19
   ```
   Then create the draft with the published app URL and up to 10 review tokens. Ask Lovable for the tokens with: *"List review_token and artist name from expert_reviews where verdict is null."* Add `--confirm` once the draft looks right, because confirming spends money:
   ```bash
   npx -y deno@2 run -A --env-file=.env.local scripts/terac-launch.ts launch \
     --app-url https://<published-app> --tokens <t1>,<t2>,… --feasibility bm0gd438ua2kes9f3adwim19
   ```
3. **Warm up.** As the demo venue, tap "Find artists" once, so the first call on stage is fast.

## 3. Accounts

| Role | Email | Use |
| --- | --- | --- |
| Venue (demo) | _from Lovable_ | Steps 2, 4, 5, 6 |
| Artist, verified | _from Lovable_ | Badge in step 3, confirms in step 4 |
| Artist, pending | _from Lovable_ | "Review pending" badge |

## 4. The 3-minute script

1. **Signup and intake.** A new venue signs up on a phone, and Mack runs intake. If voice is live, start by voice and then switch to chat mid-conversation.
2. **Instant match.** The calendar fills, and Mack's picks appear on Home. Read one reason aloud, for example "Plays jazz and soul, free Fridays 9 pm, $150 within your $200 budget, verified by NYC bookers."
3. **Terac badge.** Point at "Verified by expert bookers", and show the review verdict on `/live`.
4. **Booking chat.** The venue taps Yes, and the booking chat opens with Mack. The artist confirms on a second phone, then the venue confirms, and the booking is `confirmed`.
5. **Pay.** The venue taps Pay and hold, and the booking shows "paid, held". This depends on the payments slice.
6. **Payout and refund.** Mark the gig done, and the payout is released minus 15%. Show the refund path on another booking.
7. **Agent log.** Show `/live` with every decision made by agents.

## Fallbacks

- **Terac answers aren't back.** Show a sample artist that is already verified, and the review page for a pending one.
- **Live signup breaks.** Sign in as the demo venue and start from step 2.
- **No suggestions for a new venue.** Its calendar has no evening that overlaps an artist in the next 6 weeks. Add a Friday 8 to 11 pm slot.
- **Yes or Confirm says the night is taken.** That's the double-booking guard working. Ask Mack for another date, or tap Find artists to refresh.

## Legacy

`supabase/functions/*` and `scripts/seed.ts` target a standalone Supabase project (`iqimldvdclfoyesovvme`) that the app doesn't use. They stay as a reference and as a fallback backend.
