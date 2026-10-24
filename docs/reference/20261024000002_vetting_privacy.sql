-- Vetting privacy (base slice). Announce to the team before `supabase db push`.
--
-- 1. review_token lets anyone set an artist's verdict through expert-review (no JWT).
--    Signed-in users could read every token with `select *`, so they could verify themselves.
--    Hide the token and the Terac submission id; keep every other column readable.
--    UI note: read expert_reviews with an explicit column list, never select('*').
revoke select on expert_reviews from authenticated;
grant select (id, created_at, artist_id, terac_opportunity_id, verdict, room_fit, note) on expert_reviews to authenticated;

-- 2. At most one open review per artist, so concurrent terac-submit calls can't pay Terac twice.
create unique index if not exists one_open_review_per_artist on expert_reviews (artist_id) where verdict is null;
