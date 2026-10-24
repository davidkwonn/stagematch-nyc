# Stagehand hackathon handoff

## Replaceable contracts
- `src/data/api.ts` owns all ten action exports, exact inputs/outputs and `// edge function: ...` markers. Replace each body with the corresponding teammate invocation; no UI changes are needed.
- `src/features/voice/voice-client.ts` owns voice transport. Its current state is intentionally unavailable. The callback transcript feeds the same conversation.
- `src/data/mack-prompt.ts` owns Mack’s prompt. Current implementation streams Lovable AI output server-side, persists messages and extracts intake and booking facts.
- Domain reads, writes and subscriptions are in `src/data`; database-generated types are re-exported by `src/data/types.ts`.

## Database differences that require team agreement
The existing project already held artists, venues and bookings. Destructive replacement was not performed:
- All requested new tables and enums exist under their requested names.
- `bookings.status` remains **text**, with a trigger enforcing the exact `booking_status` values. The exported UI type uses `BookingStatus`. A future direct enum conversion requires migration permission and coordination with the live app.
- `bookings.offer_amount`, `swipes`, `booking_messages` remain deprecated and unused by the UI. `offer_amount` has a default so new `offer_usd` inserts work.
- Existing NOT NULL constraints remain on artist birthday and venue address/borough/phone/email. Signup still supplies these fields.
- Existing booking foreign-key delete semantics are retained rather than replaced.
- Grants include service_role access and agent_log sequence access. Profile UPDATE column grants intentionally exclude user_id, intake completion and artist vetting to prevent clients impersonating owners, bypassing intake or self-verifying.
- Confirmation uses `settle_booking_confirmation`, an authenticated, locked-row function. `touch_thread` is security-definer with fixed search_path so message writes update thread ordering without client thread UPDATE permission.
- New private `media` bucket exists. Old media can still be read from `artist-videos`.
- Existing bookings were backfilled with offer_usd and negotiating/cancelled status values. Their legacy conversations have not been copied to new threads; they remain preserved but do not appear in the new inbox.

## Not connected
- Whop checkout: action creates/reads a pending payment record and returns its checkout_url, currently null. No charge occurs. Teammates must create checkout URLs and implement verified payment callbacks.
- Gig outcome: validates venue, paid-held status and date; then reports that settlement is not connected. Teammates must acknowledge the payment provider before returning released/refunded.
- Voice is the requested unavailable stub. Client-supplied agent turns are currently refused until a trusted voice transport is wired; do not accept spoofable agent messages.
- Terac opportunity creation is not implemented. Public expert-review tokens and submission work; they are bearer links and should not be shared beyond intended experts.
- Sample contacts and descriptions are fictional. Venue names are real NYC names but are not partnerships; sample venue addresses explicitly say unverified. Sample artists have no fabricated performance recordings.

## Sample records
12 fictional artists and 12 real-name sample venues, four weeks of dated Friday/Saturday availability, 48 suggestions, manager threads and expert review invitations are persisted. Added through the data tool, not on page load. Sample data seeding is separate from schema migrations because this project’s migration tool permits DDL and additive backfills only.

## Verified
Artist account: required intake → real AI extraction → calendar; manual slot persisted; follow-up recalled $200 and 45 minutes; voice unavailable notice; phone calendar/profile/chat have no horizontal overflow. Rule tests cover intake, recurring dates and fee/outcome eligibility. Public live totals read real records. Additional flow checks are recorded in the task roadmap.
