# Prompt 1 — Lovable (paste into the existing Stagehand project)

> Paste everything below the line into Lovable. If Lovable asks to split it, send sections 1–3 first, then 4–6, then 7–8. The SQL at the end is the database contract shared with the backend team: create it exactly.

---

We are evolving Stagehand into its hackathon version. Keep the name Stagehand, the AI booking manager Mack, the current visual identity, auth, and the existing signup forms. This app is the UI of a larger system: after this round the code is exported to our GitHub repo and wired to Supabase Edge Functions written by teammates. Build it so that swap is a one-file change per feature (rules in section 1).

## 1. Architecture rules (most important)

- **Database**: replace the current tables (`swipes`, `bookings`, `booking_messages`, and the old `artists` / `venues` columns) with the schema at the end of this prompt, exactly: same table, column, enum and function names, same RLS. Our backend reads these exact names.
- **Data layer**: components never call Supabase directly. All reads, writes and subscriptions live in `src/data/`: one file per domain (`profiles.ts`, `availability.ts`, `threads.ts`, `suggestions.ts`, `bookings.ts`, `reviews.ts`, `live.ts`), typed with `src/data/types.ts` (generated from the schema).
- **Backend actions**: every action that is not a plain own-row write goes through one file, `src/data/api.ts`, with exactly these functions and signatures. Above each one, a comment `// edge function: <name>`. Their bodies can use whatever works inside Lovable today (server functions, Lovable AI, simple local logic); after export we replace each body with `supabase.functions.invoke('<name>', { body })`, so keep inputs and outputs exactly as listed:
  - `startMack(party: 'artist' | 'venue'): Promise<{ thread_id: string }>` // edge function: mack-start — get or create the user's manager thread; if empty, Mack posts its intake opener.
  - `sendMessage(thread_id: string, content: string): Promise<{ message_id: string }>` // edge function: mack-chat — save the user's message; Mack replies into the same thread (the UI receives it by Realtime).
  - `saveVoiceTurns(thread_id: string, turns: { speaker: 'user' | 'agent'; text: string }[]): Promise<{ ok: true }>` // edge function: voice-turns
  - `findArtists(venue_id: string): Promise<{ suggestions: Suggestion[] }>` // edge function: match
  - `decideSuggestion(suggestion_id: string, decision: 'yes' | 'no'): Promise<{ booking_id?: string; thread_id?: string }>` // edge function: suggestion-decision
  - `confirmBooking(booking_id: string, decline?: boolean): Promise<{ status: BookingStatus }>` // edge function: booking-confirm
  - `payBooking(booking_id: string): Promise<{ checkout_url: string | null }>` // edge function: whop-checkout
  - `reportGig(booking_id: string, performed: boolean): Promise<{ status: BookingStatus }>` // edge function: gig-outcome
  - `getReview(token: string)` and `submitReview(token, { verdict: 'verified' | 'rejected'; room_fit: string[]; note: string })` // edge function: expert-review
- **Mack in Lovable for now**: implement `startMack` and `sendMessage` with Lovable AI so chat works today. Mack's instructions live in one file, `src/data/mack-prompt.ts`. During intake Mack collects and saves: availability rows (`source = 'chat'`), `start_date`, `set_length_min`, `rate_usd` (artist) or `budget_usd` and `capacity` (venue), `goals`, then sets `intake_completed_at`. Mack replies are inserted with `sender_role = 'agent'`. In booking threads Mack mediates date, start time, set length and pay, and writes them on the booking.
- **Voice**: the UI only. Put the voice transport behind `src/features/voice/voice-client.ts` exporting `createVoiceClient()` with `start(thread_id, { onTurn, onState })`, `stop()`, `mute(on)`. Ship a stub that sets state `unavailable` and shows "Voice is coming online". A teammate replaces this file with the real OpenAI WebRTC client; voice turns are written into the same thread with `channel = 'voice'`.
- **Realtime**: subscriptions in `src/data/realtime.ts`; threads, messages, suggestions, bookings, payments and availability update live.
- **Logging**: whenever the app's own logic decides something (Mack saved availability, a suggestion was made), insert a row in `agent_log` through `src/data/live.ts`.
- **Storage**: private bucket `media`, path `{user_id}/{filename}`, viewers get signed URLs.

## 2. Mobile-first layout

Design for a phone first, then desktop. Mobile: bottom tab bar with 4 tabs: **Home**, **Calendar**, **Inbox**, **Profile**. Desktop: the same 4 items in a left sidebar. Safe-area padding, 44px touch targets, sticky composer above the keyboard, no horizontal scroll at 360px width.

## 3. Onboarding and intake (required)

After the signup form (keep the current artist and venue forms; add `borough` and `phone` to artists if missing), the user lands on **Intake with Mack**, a required step before the rest of the app unlocks (redirect there until `intake_completed_at` is set).

- Header: Mack's avatar, "Let's set up your calendar", a segmented control **Chat | Voice** (switchable at any time, same conversation).
- Chat mode: messaging UI (section 5) on the manager thread.
- Voice mode: a large round call button, live state (connecting, listening, Mack speaking), a mute button, and the live transcript rendered as the same bubbles in the same thread, with a small mic icon on voice turns.
- A compact checklist strip of what Mack has collected: Availability, Start date, Set length, Pay, Goals (ticks fill in live from the profile and availability).
- When intake completes: a short success state, then go to Calendar.

## 4. Calendar

The user's availability from the `availability` table:
- Month view (dates with availability are marked; weekly rows mark their weekday every week) and an agenda list below.
- Tap a day → sheet with its slots; add, edit, delete a slot (date or weekly, start and end time, note). Writes go to `availability` with `source = 'manual'`.
- Source chip on each slot: Chat, Voice, Manual.
- "Ask Mack to update" button → opens the manager thread.
- Venues: after a calendar change, call `findArtists(venue_id)` and show a toast "Mack found N artists for your dates".

## 5. Inbox (the bookings tab), a messaging app

- Thread list: Mack's manager thread pinned on top, then booking threads ordered by `last_message_at`, with avatar, name, last message preview, time, unread dot.
- Thread view: chat bubbles (mine right, others left, Mack with its own avatar and colour), day separators, voice turns marked with a mic icon, composer with send button and a mic button that switches the thread to voice mode.
- Booking threads: a pinned **booking card** at the top: other party, gig date, start time, set length, pay, status pill (negotiating, confirmed, paid and held, performed, paid out, refunded, cancelled), and the actions allowed for that status and side:
  - negotiating: Confirm, Decline (both sides)
  - confirmed: venue sees **Pay and hold** (`payBooking` → open `checkout_url` in a new tab); artist sees "Waiting for the venue's payment"
  - paid_held, after the gig date: venue sees **It happened** / **No-show** (`reportGig`)
  - payments status and amounts (amount, our 15% fee, artist payout) from `payments`.
- Mack reads every thread: its manager thread may mention what happened in booking threads.

## 6. Home

- **Venue Home = Suggestions**: cards of `suggestions` with status `suggested`: artist photo or video (signed URL, inline player), name, genres, borough, the matching slot ("Fri Nov 7, 9 pm"), Mack's one-line reason, score, and a **Verified by expert bookers** badge when `artists.vetting = 'verified'` (grey "Review pending" when `pending`). Big Yes / No buttons (swipe on mobile). Yes → `decideSuggestion` → open the new booking thread. Empty state → "Find artists" (`findArtists`).
- **Artist Home**: profile completeness, vetting badge, next gigs (bookings confirmed or later), and a shortcut to Mack.

## 7. Profile

Edit the signup fields and the intake fields; upload a performance video and a photo (artists), a photo (venues). Show the vetting status for artists.

## 8. Public pages

- `/review/:token` (no login): the page Terac experts open. Shows the artist (photo, video, genres, background, rate, availability summary) and a short form: "Would you book this artist?" Yes / No, room fit chips (Bar, Club, Music venue, Restaurant, Café, Rooftop), a one-line note, Submit → `submitReview`. Clean, fast, mobile-friendly; a thank-you state after submit.
- `/live` (no login): the demo screen. A live feed of `agent_log` (time, agent, action, short detail) plus counters: artists, venues, suggestions, bookings by status, money held and paid out. Dark, dense, readable on a projector.

## 9. Seed data

Seed 12 artists and 12 venues (real NYC venue names, fake `example.com` contacts) with availability for the next 4 weeks, so suggestions and the calendar have content during the demo.

## Database schema (create exactly)

```sql
-- Stagehand: the shared contract. One Supabase project, used by the Lovable UI,
-- the edge functions, and the voice agent. Every prompt points here.
-- Changing it = a new migration file announced to the team.

-- Enums ---------------------------------------------------------------------

create type party_type as enum ('artist', 'venue');
create type thread_kind as enum ('manager', 'booking');
create type sender_role as enum ('artist', 'venue', 'agent', 'system');
create type message_channel as enum ('text', 'voice');
create type availability_kind as enum ('date', 'weekly');
create type availability_source as enum ('chat', 'voice', 'manual');
create type suggestion_status as enum ('suggested', 'accepted', 'declined');
create type booking_status as enum ('negotiating', 'confirmed', 'paid_held', 'performed', 'released', 'refunded', 'cancelled');
create type payment_status as enum ('pending', 'held', 'released', 'refunded');
create type vetting_status as enum ('unverified', 'pending', 'verified', 'rejected');

-- Parties -------------------------------------------------------------------

create table artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  created_at timestamptz not null default now(),
  -- signup form
  name text not null,
  birthday date,
  background text not null default '',
  genres text[] not null default '{}',
  borough text,
  email text,
  phone text,
  video_path text,
  photo_path text,
  -- filled by Mack during intake (chat or voice)
  start_date date,
  set_length_min int,
  rate_usd int,
  goals text,
  intake_completed_at timestamptz,
  -- Terac vetting
  vetting vetting_status not null default 'unverified',
  vetting_note text
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  created_at timestamptz not null default now(),
  -- signup form
  name text not null,
  venue_type text not null default 'Bar',
  address text not null default '',
  borough text,
  genres text[] not null default '{}',
  contact_name text,
  email text,
  phone text,
  photo_path text,
  -- filled by Mack during intake (chat or voice)
  start_date date,
  set_length_min int,
  budget_usd int,
  capacity int,
  goals text
  , intake_completed_at timestamptz
);

-- Calendar: one row per available slot. 'date' rows use `date`; 'weekly' rows use `weekday` (0 = Sunday).
create table availability (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_type party_type not null,
  owner_id uuid not null,
  kind availability_kind not null,
  date date,
  weekday int check (weekday between 0 and 6),
  start_time time not null default '19:00',
  end_time time not null default '23:00',
  note text,
  source availability_source not null default 'manual',
  check ((kind = 'date' and date is not null) or (kind = 'weekly' and weekday is not null))
);

-- Conversations -------------------------------------------------------------
-- 'manager' thread: one per artist or venue, with Mack (intake happens here).
-- 'booking' thread: artist + venue + Mack, one per booking.
-- Text and voice turns land in the same thread: that is the shared context.

create table threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind thread_kind not null,
  artist_id uuid references artists(id) on delete cascade,
  venue_id uuid references venues(id) on delete cascade,
  booking_id uuid,
  last_message_at timestamptz not null default now(),
  check (kind = 'booking' or num_nonnulls(artist_id, venue_id) = 1)
);
create unique index one_manager_thread_per_artist on threads (artist_id) where kind = 'manager';
create unique index one_manager_thread_per_venue on threads (venue_id) where kind = 'manager';

create table messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references threads(id) on delete cascade,
  sender_role sender_role not null,
  sender_id uuid,
  channel message_channel not null default 'text',
  content text not null
);

-- Facts Mack pulls out of every conversation, reused in its context.
create table mack_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_type party_type not null,
  owner_id uuid not null,
  thread_id uuid references threads(id) on delete set null,
  note text not null
);

-- Matching and booking ------------------------------------------------------

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  venue_id uuid not null references venues(id) on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  score int not null default 0,
  reason text not null default '',
  slot_date date,
  slot_start time,
  status suggestion_status not null default 'suggested',
  unique (venue_id, artist_id)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  venue_id uuid not null references venues(id) on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  suggestion_id uuid references suggestions(id) on delete set null,
  gig_date date,
  start_time time,
  set_length_min int,
  offer_usd int,
  status booking_status not null default 'negotiating',
  artist_confirmed boolean not null default false,
  venue_confirmed boolean not null default false
);
alter table threads add constraint threads_booking_fk foreign key (booking_id) references bookings(id) on delete cascade;
create unique index one_thread_per_booking on threads (booking_id) where kind = 'booking';

create table payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  amount_usd numeric(10, 2) not null,
  fee_usd numeric(10, 2) not null,
  payout_usd numeric(10, 2) not null,
  whop_checkout_id text,
  whop_payment_id text,
  checkout_url text,
  status payment_status not null default 'pending'
);

-- Terac expert vetting of artist profiles.
create table expert_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  artist_id uuid not null references artists(id) on delete cascade,
  review_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  terac_opportunity_id text,
  terac_submission_id text,
  verdict text check (verdict in ('verified', 'rejected')),
  room_fit text[],
  note text
);

-- Every agent decision, shown live on /live for the demo.
create table agent_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  agent text not null,
  action text not null,
  detail jsonb not null default '{}'
);

create index on availability (owner_type, owner_id);
create index on messages (thread_id, created_at);
create index on suggestions (venue_id, status);
create index on bookings (artist_id);
create index on bookings (venue_id);

-- Keep threads.last_message_at fresh for the inbox ordering.
create or replace function touch_thread() returns trigger language plpgsql as $$
begin
  update threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end $$;
create trigger messages_touch_thread after insert on messages for each row execute function touch_thread();

-- Ownership helpers (used by RLS) -------------------------------------------

create or replace function owns_party(_type party_type, _id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case _type
    when 'artist' then exists (select 1 from artists where id = _id and user_id = auth.uid())
    when 'venue' then exists (select 1 from venues where id = _id and user_id = auth.uid())
  end
$$;

create or replace function is_thread_party(_thread_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from threads t
    left join bookings b on b.id = t.booking_id
    where t.id = _thread_id and (
      owns_party('artist', coalesce(t.artist_id, b.artist_id)) or
      owns_party('venue', coalesce(t.venue_id, b.venue_id))
    )
  )
$$;

-- Access --------------------------------------------------------------------
-- Clients read through RLS and write their own profile, calendar and messages.
-- Everything else (agent replies, suggestions, bookings, payments, vetting)
-- is written by edge functions with the service role.

alter table artists enable row level security;
alter table venues enable row level security;
alter table availability enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table mack_notes enable row level security;
alter table suggestions enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;
alter table expert_reviews enable row level security;
alter table agent_log enable row level security;

create policy read on artists for select to authenticated using (true);
create policy own_insert on artists for insert to authenticated with check (user_id = auth.uid());
create policy own_update on artists for update to authenticated using (user_id = auth.uid());

create policy read on venues for select to authenticated using (true);
create policy own_insert on venues for insert to authenticated with check (user_id = auth.uid());
create policy own_update on venues for update to authenticated using (user_id = auth.uid());

create policy read on availability for select to authenticated using (true);
create policy own_write on availability for all to authenticated
  using (owns_party(owner_type, owner_id)) with check (owns_party(owner_type, owner_id));

create policy party_read on threads for select to authenticated using (is_thread_party(id));

create policy party_read on messages for select to authenticated using (is_thread_party(thread_id));
create policy party_post on messages for insert to authenticated
  with check (sender_id = auth.uid() and sender_role in ('artist', 'venue') and is_thread_party(thread_id));

create policy own_read on mack_notes for select to authenticated using (owns_party(owner_type, owner_id));

create policy party_read on suggestions for select to authenticated
  using (owns_party('venue', venue_id) or owns_party('artist', artist_id));
create policy party_read on bookings for select to authenticated
  using (owns_party('venue', venue_id) or owns_party('artist', artist_id));
create policy party_read on payments for select to authenticated
  using (exists (select 1 from bookings b where b.id = booking_id and (owns_party('venue', b.venue_id) or owns_party('artist', b.artist_id))));

create policy read on expert_reviews for select to authenticated using (true);
create policy read on agent_log for select to anon, authenticated using (true);

grant select, insert, update on artists, venues to authenticated;
grant select, insert, update, delete on availability to authenticated;
grant select on threads, mack_notes, suggestions, bookings, payments, expert_reviews to authenticated;
grant select, insert on messages to authenticated;
grant select on agent_log to anon, authenticated;

alter publication supabase_realtime add table messages, threads, availability, suggestions, bookings, payments, agent_log;

-- Storage: private bucket, viewers get signed URLs.
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;
create policy media_read on storage.objects for select to authenticated using (bucket_id = 'media');
create policy media_own_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_own_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
```
