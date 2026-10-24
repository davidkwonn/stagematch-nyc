-- Switch to production Whop: run right after the secrets change (production WHOP_API_KEY,
-- WHOP_ENV=production, WHOP_SIMULATE=false, the production webhook's WHOP_WEBHOOK_SECRET)
-- and BEFORE sharing any link. At that moment every payment row is sandbox or simulated,
-- which is what this script assumes. Run step 1 first and read it.

-- 1. Review: open and held payments that will change.
select p.booking_id, p.status, p.amount_usd, p.whop_payment_id, p.checkout_url is not null as has_link,
       b.status as booking_status, b.gig_date
from payments p join bookings b on b.id = p.booking_id
where p.status in ('pending', 'held')
order by p.created_at;

begin;

-- 2. Unpaid bookings: drop the sandbox checkout links so whop-checkout creates production ones.
update payments set checkout_url = null, whop_checkout_id = null, updated_at = now()
where status = 'pending';

-- 3. Sandbox-held payments: no real money is held behind them, so close those test bookings.
--    Left alone, gig-outcome would refuse the payout (it checks the payment on production Whop)
--    and a no-show refund would fail.
with closed as (
  delete from payments where status = 'held' returning booking_id
)
update bookings set status = 'cancelled'
where id in (select booking_id from closed) and status in ('paid_held', 'performed');

insert into agent_log (agent, action, detail)
values ('payments', 'switched_to_production', '{"cleared": "sandbox checkout links and sandbox-held payments"}');

commit;

-- 4. Optional: sandbox released/refunded rows still count in the /live totals ("money held and
--    paid out"). To show only real money from now on:
-- delete from payments where status in ('released', 'refunded');
