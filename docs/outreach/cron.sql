-- Outreach cron (run in Lovable's chat after outreach-run is deployed). Replace <CRON_SECRET> there, never in git.
-- Every 10 minutes, alternating artists and venues; each run walks the next slice of its query matrix.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('outreach-run', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://luxpdpyxsywmggvewars.supabase.co/functions/v1/outreach-run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := jsonb_build_object('kind', case when (extract(minute from now())::int / 10) % 2 = 0 then 'artist' else 'venue' end),
    timeout_milliseconds := 60000)
$$);
