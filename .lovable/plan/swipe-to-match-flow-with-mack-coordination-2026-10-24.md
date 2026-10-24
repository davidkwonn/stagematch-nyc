# Swipe-to-match flow with Mack coordination

## The bug
Saying yes to an artist fails because the booking is saved without the legacy `offer_amount` field, which the database still checks. Fix: save the same offer into both fields when the booking is created.

## New venue flow
1. **Swipe deck on Home** — one artist card at a time. Swipe left/right or tap X / heart. X dismisses the artist and shows the next card; yes opens the artist's profile page.
2. **Artist profile page** (`/artist/$id`) — venue-only page with the artist's video, photo, background, genres, rate, availability, and a **Confirm artist** button. Confirming creates the booking and opens the group chat.
3. **Mack outreach on confirm** — when a venue confirms an artist:
   - Mack messages the venue's manager chat: match details and asks for Google Meet availability.
   - Mack messages the artist's manager chat: they've been matched, with venue info.
   - A 3-way group chat (venue + artist + Mack) opens with Mack's kickoff about scheduling the video call.
4. **Mack's booking role** — update Mack's instructions: first schedule a Google Meet call between the parties, then confirm the in-person gig date/time/set/pay, remind both sides to press Confirm, and once both confirm, the venue is charged (payment stays stubbed until the provider connects — no simulated charges).

## Technical details
- `src/data/backend.server.ts`: add `offer_amount` to the booking insert (bug fix); on accept, insert agent messages into both manager threads and a richer booking-thread kickoff.
- `src/routes/_authenticated/home.tsx`: replace the card grid with a single-card swipe deck (pointer swipe + X/heart buttons); yes navigates to the artist profile instead of deciding immediately.
- New `src/routes/_authenticated/artist.$id.tsx`: venue-only profile view with signed video/photo URLs and confirm action.
- `src/data/mack-prompt.ts`: add the Meet-call-then-in-person flow and charge-on-confirmation wording.
- Verify: typecheck, existing tests, and a browser run of swipe → profile → confirm → group chat.
