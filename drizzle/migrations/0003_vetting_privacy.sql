revoke select on public.expert_reviews from authenticated;
grant select (id, created_at, artist_id, terac_opportunity_id, verdict, room_fit, note) on public.expert_reviews to authenticated;
create unique index if not exists one_open_review_per_artist on public.expert_reviews (artist_id) where verdict is null;