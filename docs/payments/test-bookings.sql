-- Payments test: two bookings whose show ended an hour ago (New York time), confirmed by both
-- sides and ready for "Pay and hold" on Whop sandbox.
--   $150 booking → pay, then report "It happened" → artist payout (released)
--   $100 booking → pay, then report "No-show"     → refund to the venue (refunded)
-- Replace the two emails with the venue and artist accounts used on the phone.
-- The statement returns 2 rows; 0 rows means an email didn't match.
--
-- The It happened / No-show buttons show from the gig day once PR #3 is merged; before that
-- they show only the day after the gig, so use interval '1 day' below instead of '2 hours'.

with v as (select id from venues where email = 'VENUE_EMAIL'),
a as (select id from artists where email = 'ARTIST_EMAIL'),
s as (select date_trunc('minute', (now() at time zone 'America/New_York') - interval '2 hours') as start_at),
b as (
  insert into bookings (venue_id, artist_id, gig_date, start_time, set_length_min, offer_usd, offer_amount,
                        status, artist_confirmed, venue_confirmed)
  select v.id, a.id, s.start_at::date, s.start_at::time, 60, x.amount, x.amount, 'confirmed', true, true
  from v, a, s, (values (150), (100)) as x(amount)
  returning id, artist_id, venue_id, offer_usd, gig_date, start_time
),
th as (
  insert into threads (kind, artist_id, venue_id, booking_id)
  select 'booking'::thread_kind, artist_id, venue_id, id from b
  returning id, booking_id
)
insert into messages (thread_id, sender_role, content)
select th.id, 'agent'::sender_role,
  format('Payments test booking: the show on %s at %s is over. Venue, tap Pay and hold, then report %s.',
         b.gig_date, to_char(b.start_time, 'HH24:MI'),
         case when b.offer_usd = 150 then '"It happened" (artist payout)' else '"No-show" (refund)' end)
from th join b on b.id = th.booking_id
returning thread_id;
