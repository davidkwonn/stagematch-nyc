// terac-submit { artist_id } → { review_id, token, review_url, opportunity_id }
// Called by Mack (service role) when an artist completes intake, or by the artist.
// Creates the review link, marks the artist 'pending', launches a Terac review.

import { HttpError, json, serve } from '../_shared/cors.ts';
import { db, getCaller, log } from '../_shared/db.ts';
import { isServiceCall, isUuid, readJson } from '../_shared/internal.ts';
import { launchReview, SIMULATED_OPPORTUNITY, teracSimulated } from '../_shared/terac.ts';

const DEFAULT_REVIEWERS = 1;

// The review token lets anyone set the verdict: it goes to Terac and to service callers only,
// never to the artist and never into agent_log (anon-readable on /live).
async function openReview(artistId: string) {
  const find = () => db.from('expert_reviews').select('*').eq('artist_id', artistId).is('verdict', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: open } = await find();
  if (open) return open;
  const { data, error } = await db.from('expert_reviews').insert({ artist_id: artistId }).select('*').single();
  if (!error) return data;
  if (error.code === '23505') return (await find()).data; // a concurrent call created it (one_open_review_per_artist)
  throw error;
}

serve(async req => {
  const { artist_id } = await readJson<{ artist_id?: string }>(req);
  if (!isUuid(artist_id)) throw new HttpError(400, 'artist_id required');
  const service = await isServiceCall(req);
  if (!service) {
    const caller = await getCaller(req);
    if (caller.artist?.id !== artist_id) throw new HttpError(403, 'not your profile');
  }
  // Needed only to send a real Terac booker to the review page; simulate mode works without it.
  const appUrl = Deno.env.get('APP_URL') ?? '';

  const { data: artist } = await db.from('artists').select('id, name, vetting').eq('id', artist_id).maybeSingle();
  if (!artist) throw new HttpError(404, 'artist not found');
  if (artist.vetting === 'verified') return json({ skipped: 'already verified' });

  // Reuse an open review instead of paying for a second one.
  const review = await openReview(artist_id);
  if (!review) throw new Error('could not create review');

  await db.from('artists').update({ vetting: 'pending' }).eq('id', artist_id);
  const reviewUrl = `${appUrl}/review/${review.review_token}`;
  const reply = (opportunityId: string | null, extra: Record<string, unknown> = {}) => json({
    review_id: review.id, status: 'pending', opportunity_id: opportunityId, ...extra,
    ...(service && { token: review.review_token, review_url: reviewUrl }),
  });

  if (teracSimulated()) {
    if (review.terac_opportunity_id !== SIMULATED_OPPORTUNITY) {
      await db.from('expert_reviews').update({ terac_opportunity_id: SIMULATED_OPPORTUNITY }).eq('id', review.id);
      await log('vetting', 'review_requested', { artist_id, artist: artist.name, simulated: true });
    }
    return reply(null, { simulated: true });
  }

  // Already sent to a real Terac opportunity: don't pay twice.
  if (review.terac_opportunity_id && review.terac_opportunity_id !== SIMULATED_OPPORTUNITY) {
    return reply(review.terac_opportunity_id);
  }
  if (!appUrl) {
    await log('vetting', 'terac_launch_failed', { artist_id, artist: artist.name, error: 'APP_URL is not set' });
    return reply(null, { error: 'APP_URL is not set' });
  }

  // A shared opportunity launched by hand (MCP) collects links in its brief: just tag the row.
  const shared = Deno.env.get('TERAC_OPPORTUNITY_ID');
  let opportunityId = shared ?? null;
  if (!shared) {
    try {
      const reviewers = Number(Deno.env.get('TERAC_REVIEWERS') ?? DEFAULT_REVIEWERS) || DEFAULT_REVIEWERS;
      const opp = await launchReview({ artistName: artist.name, reviewUrl, reviewers });
      opportunityId = opp.id;
      await log('vetting', 'terac_launched', { artist_id, artist: artist.name, opportunity_id: opp.id, status: opp.status });
    } catch (e) {
      // Keep the artist pending; the review link still works and can be launched by hand.
      await log('vetting', 'terac_launch_failed', { artist_id, artist: artist.name, error: e instanceof Error ? e.message : String(e) });
      return reply(null, { error: 'terac launch failed' });
    }
  }

  await db.from('expert_reviews').update({ terac_opportunity_id: opportunityId }).eq('id', review.id);
  await log('vetting', 'review_requested', { artist_id, artist: artist.name, opportunity_id: opportunityId });
  return reply(opportunityId);
});
