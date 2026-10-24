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
