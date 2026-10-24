-- Outreach center (additive). Run once in Lovable's chat: "Run this SQL".
-- Lead data is personal: server-only (service role). RLS on, no policies, no grants for anon/authenticated.

create table if not exists public.outreach_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('artist', 'venue')),
  name text not null,
  source text not null check (source in ('bandcamp', 'soundcloud', 'web')),
  source_url text not null unique,            -- normalized
  borough text,
  genre text,
  venue_type text,                             -- venues: bar, music_venue, restaurant_cafe, other
  bio_snippet text,
  email text,
  contact_type text not null check (contact_type in ('email', 'contact_form')),
  score int not null default 0,
  status text not null default 'new'
    check (status in ('new', 'approved', 'contacted', 'replied', 'signed_up', 'declined', 'opted_out', 'bounced')),
  found_by_query text,
  created_at timestamptz not null default now(),
  contacted_at timestamptz
);
create unique index if not exists outreach_leads_email_unique on public.outreach_leads (lower(email)) where email is not null;
create index if not exists outreach_leads_kind_score on public.outreach_leads (kind, score desc);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'simulated', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outreach_messages_lead on public.outreach_messages (lead_id);

create table if not exists public.outreach_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('artist', 'venue')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  queries jsonb not null default '[]',
  raw_results int not null default 0,
  accepted int not null default 0,
  contact_form int not null default 0,
  rejected jsonb not null default '{}',        -- counts per rule
  drafted int not null default 0,
  error text
);

create table if not exists public.do_not_contact (
  email text primary key,                      -- stored lowercased
  reason text,
  created_at timestamptz not null default now()
);

alter table public.outreach_leads enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_runs enable row level security;
alter table public.do_not_contact enable row level security;

revoke all on public.outreach_leads, public.outreach_messages, public.outreach_runs, public.do_not_contact from anon, authenticated;
grant all on public.outreach_leads, public.outreach_messages, public.outreach_runs, public.do_not_contact to service_role;
