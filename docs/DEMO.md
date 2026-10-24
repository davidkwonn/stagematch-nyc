# Stagehand demo runbook

Dry runs at 16:00 and 17:00. Fix only what breaks the happy path. Keep `/live` open on the projector.

## 1. Bring the backend up (base owner, once)

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
cp .env.example .env            # fill in the keys, never commit .env
npx supabase secrets set --env-file .env
npx supabase functions deploy health match suggestion-decision booking-confirm expert-review terac-submit terac-poll
curl https://<ref>.supabase.co/functions/v1/health
npx supabase gen types typescript --linked > supabase/functions/_shared/types.ts
```

Seed 30 artists and 20 venues. It's safe to re-run.

```bash
npx -y deno@2 run -A --env-file=.env scripts/seed.ts
```

The seed prints every account and the review links for the 5 pending artists. Every seeded account signs in with `SEED_PASSWORD`.

Run `terac-poll` every minute. Paste this into the Supabase SQL editor, never into git:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('terac-poll', '* * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/terac-poll',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb)
$$);
```

## 2. Seeded accounts

| Role | Email | Notes |
| --- | --- | --- |
| Venue | `venue-pianos@example.com` | Pianos, Lower East Side, $200 budget, Fri and Sat evenings |
| Venue | `venue-smalls-jazz-club@example.com` | Smalls Jazz Club, jazz and blues |
| Venue | `venue-baby-s-all-right@example.com` | Baby's All Right, Brooklyn |
| Artist, verified | `artist-the-night-shifts@example.com` | shows the "Verified by expert bookers" badge |
| Artist, verified | `artist-kenji-moreau@example.com` | |
| Artist, verified | `artist-velvet-static@example.com` | |
| Artist, pending | `artist-paper-lanterns@example.com` | the Terac review is waiting |
| Artist, unverified | the last 15 artists the seed prints | |

The seed picks genres and calendars, so which artists match Pianos depends on the data. Run `match` for the demo venue once before going on stage, and note who comes out on top.

## 3. Smoke-test the matching functions

Get a JWT for a seeded user:

```bash
curl -s "https://<ref>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"venue-pianos@example.com","password":"'"$SEED_PASSWORD"'"}' | jq -r .access_token
```

Then call each function with that token:

```bash
F=https://<ref>.supabase.co/functions/v1
H=(-H "Authorization: Bearer $JWT" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json")

curl -s "${H[@]}" $F/match -d '{"venue_id":"<pianos venue id>"}'                          # ranked suggestions, <2 s
curl -s "${H[@]}" $F/suggestion-decision -d '{"suggestion_id":"<id>","decision":"yes"}'    # { booking_id, thread_id }
curl -s "${H[@]}" $F/booking-confirm -d '{"booking_id":"<id>"}'                            # venue confirms
# sign in as the artist, then the same call again → { "status": "confirmed" }
```

Test the Terac review page with a token the seed printed:

```bash
curl -s "$F/expert-review?token=<token>"
curl -s $F/expert-review -H "Content-Type: application/json" \
  -d '{"token":"<token>","verdict":"yes","room_fit":["listening room"],"note":"Great live energy"}'
```

## 4. The 3-minute script

1. **Signup and voice intake.** A new venue signs up on a phone, and Mack runs intake by voice. Mid-conversation, switch to chat and show that Mack keeps going.
2. **Instant match.** The calendar fills, and Mack recommends three artists who are free on those nights. Read one reason aloud, for example "Plays jazz and soul, free Fridays 9 pm, $150 within your $200 budget, verified by NYC bookers."
3. **Terac badge.** Point at the "Verified by expert bookers" badge, and open `/live` to show the `vetting_verdict` entry.
4. **Booking chat.** The venue taps Yes, the booking chat opens, and Mack proposes the date and pay. Sign in as the artist on a second phone and confirm. When the venue confirms, Mack posts the summary.
5. **Pay.** The venue pays through Whop, and the booking shows "paid, held".
6. **Payout and refund.** Mark the gig done, and the payout is released minus 15%. Then show the refund path on a second booking.
7. **Agent log.** Show `/live` with every decision made by agents.

## Notes for the UI

- `/live` counters come from `live-stats` (GET, no login). It returns artist, venue and suggestion counts, bookings by status, and money held, paid out, refunded and earned in fees. Signed-out users can't read those tables directly.
- `match` returns `{ suggestions, new_count }`. Use `new_count` for the "Mack found N artists" toast. The `suggestions` list is the venue's full set of open cards, refreshed on every call.
- `expert-review` GET also returns `availability` and `availability_summary` for the review page.
- Terac adds `submissionId` to the review link. Pass it back as `terac_submission_id` when submitting, so the booker gets approved and paid.
- Call `match` once before going on stage. The first call after a deploy takes about 5 s. Warm calls take about 1.3 s.

## Fallbacks

- **Terac answers aren't back yet.** Set `TERAC_SIMULATE=true`, and `terac-poll` writes a verdict after one minute. The verdict is flagged `simulated` in `agent_log`, so say so on stage.
- **Live signup breaks.** Sign in as `venue-pianos@example.com` and start from step 2.
- **Match returns nothing for a new venue.** Its calendar has no evening that overlaps an artist in the next 6 weeks. Add a Friday 8 to 11 pm slot.
