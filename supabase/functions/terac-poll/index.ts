// terac-poll (cron, CRON_SECRET): approves finished Terac submissions,
// and in simulate mode writes a local verdict for reviews older than a minute.

import { json, serve } from '../_shared/cors.ts';
import { db, log } from '../_shared/db.ts';
import { assertCron } from '../_shared/internal.ts';
import { approve, SIMULATED_OPPORTUNITY, submissions, teracSimulated } from '../_shared/terac.ts';

const SIMULATE_AFTER_MS = 60_000;

type Review = { id: string; artist_id: string; created_at: string; terac_opportunity_id: string | null; terac_submission_id: string | null; verdict: string | null };
type Artist = { id: string; name: string; genres: string[]; background: string; video_path: string | null };

// Plausible rooms for a genre mix, for simulated verdicts.
function roomsFor(genres: string[]): string[] {
  const g = genres.map(x => x.toLowerCase()).join(' ');
  const rooms: string[] = [];
  if (/jazz|soul|r&b|blues|classical/.test(g)) rooms.push('listening room', 'cocktail bar');
  if (/rock|punk|indie|metal|garage/.test(g)) rooms.push('rock club', 'dive bar');
  if (/electronic|house|techno|dj|hip/.test(g)) rooms.push('club night', 'late-night bar');
  if (/folk|singer|acoustic|country/.test(g)) rooms.push('cafe', 'wine bar');
  return rooms.length ? [...new Set(rooms)].slice(0, 3) : ['neighborhood bar'];
}

async function simulate(reviews: Review[]) {
  const due = reviews.filter(r => !r.verdict && r.terac_opportunity_id === SIMULATED_OPPORTUNITY &&
    Date.now() - Date.parse(r.created_at) > SIMULATE_AFTER_MS);
  if (!due.length) return 0;
  const { data: artists } = await db.from('artists').select('id, name, genres, background, video_path')
    .in('id', due.map(r => r.artist_id));
  const byId = new Map((artists ?? []).map(a => [a.id, a as Artist]));
  for (const r of due) {
    const a = byId.get(r.artist_id);
    if (!a) continue;
    const thin = !a.genres.length || a.background.trim().length < 20;
    const verdict = thin ? 'rejected' : 'verified';
    const room_fit = roomsFor(a.genres);
    const note = thin
      ? 'Profile is too thin to judge: add a clip and a few lines about past shows.'
      : `Solid fit for a ${room_fit[0]}; would book for a weeknight slot.`;
    const { data: changed } = await db.from('expert_reviews').update({ verdict, room_fit, note })
      .eq('id', r.id).is('verdict', null).select('id');
    if (!changed?.length) continue; // a real booker answered in the meantime
    await db.from('artists').update({ vetting: verdict, vetting_note: note }).eq('id', a.id);
    await log('vetting', 'vetting_verdict', { artist_id: a.id, artist: a.name, verdict, room_fit, note, simulated: true });
  }
  return due.length;
}

// Approve submissions that reached 'awaiting_review' once our page has the booker's verdict.
async function approveFinished(reviews: Review[]) {
  const answered = reviews.filter(r => r.terac_opportunity_id && r.terac_opportunity_id !== SIMULATED_OPPORTUNITY && r.verdict);
  const opportunities = [...new Set(answered.map(r => r.terac_opportunity_id as string))];
  const knownSubmissions = new Set(answered.map(r => r.terac_submission_id).filter(Boolean));
  // Shared (hand-launched) opportunity: only pay for submissions tied to an answer on our page.
  // One opportunity per artist: the artist's verdict is enough.
  const sharedOpp = Deno.env.get('TERAC_OPPORTUNITY_ID');
  let approved = 0;
  for (const opp of opportunities) {
    try {
      for (const s of await submissions(opp)) {
        if (s.status !== 'awaiting_review') continue;
        if (opp === sharedOpp && !knownSubmissions.has(s.id)) continue;
        await approve(s.id);
        approved++;
        await log('vetting', 'terac_submission_approved', { opportunity_id: opp, submission_id: s.id });
      }
    } catch (e) {
      await log('vetting', 'terac_poll_failed', { opportunity_id: opp, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return approved;
}

serve(async req => {
  await assertCron(req);
  const { data, error } = await db.from('expert_reviews')
    .select('id, artist_id, created_at, terac_opportunity_id, terac_submission_id, verdict')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const reviews = (data ?? []) as Review[];

  const simulated = teracSimulated() ? await simulate(reviews) : 0;
  const approved = teracSimulated() ? 0 : await approveFinished(reviews);
  if (simulated || approved) await log('vetting', 'terac_poll', { simulated, approved });
  return json({ ok: true, simulated, approved });
});
