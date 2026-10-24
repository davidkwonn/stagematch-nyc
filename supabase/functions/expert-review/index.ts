// expert-review (no JWT): the page a Terac booker opens.
// GET ?token=      → { artist, video_url, photo_url, review }
// POST { token, verdict, room_fit, note, terac_submission_id? } → { ok }
// Terac appends submissionId / teracSubmissionId to the task URL; the page passes it back.

import { HttpError, json, serve } from '../_shared/cors.ts';
import { db, log } from '../_shared/db.ts';
import { formatDate, formatTime, isoDate, todayNY, weekdayName } from '../_shared/format.ts';
import { readJson } from '../_shared/internal.ts';

const SIGNED_URL_SECONDS = 60 * 60;
const MAX_DATED = 6;
const MAX_NOTE = 1000;
const MAX_ROOMS = 8;

// Profile fields a reviewer may see: no email, phone or birthday.
const PUBLIC_ARTIST = 'id, name, background, genres, borough, rate_usd, set_length_min, goals, video_path, photo_path, vetting';

async function reviewByToken(token: unknown) {
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/i.test(token)) throw new HttpError(400, 'valid token required');
  const { data } = await db.from('expert_reviews').select('*').eq('review_token', token).maybeSingle();
  if (!data) throw new HttpError(404, 'review not found');
  return data;
}

async function signed(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from('media').createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

function normalizeVerdict(v: unknown): 'verified' | 'rejected' {
  const s = String(v ?? '').toLowerCase();
  if (['verified', 'yes', 'true', 'book'].includes(s)) return 'verified';
  if (['rejected', 'no', 'false', 'pass'].includes(s)) return 'rejected';
  throw new HttpError(400, "verdict must be 'verified' or 'rejected' (or yes/no)");
}

type Slot = { kind: string; date: string | null; weekday: number | null; start_time: string; end_time: string };

// "Fridays 8 pm–11 pm · Tue Oct 27 9 pm–11:59 pm" for the reviewer.
function availabilitySummary(slots: Slot[]): string {
  const weekly = slots.filter(s => s.kind === 'weekly' && s.weekday !== null)
    .map(s => `${weekdayName(s.weekday as number)}s ${formatTime(s.start_time)}–${formatTime(s.end_time)}`);
  const dated = slots.filter(s => s.kind === 'date' && s.date).sort((a, b) => (a.date as string).localeCompare(b.date as string))
    .slice(0, MAX_DATED).map(s => `${formatDate(s.date as string)} ${formatTime(s.start_time)}–${formatTime(s.end_time)}`);
  return [...weekly, ...dated].join(' · ');
}

serve(async req => {
  if (req.method === 'GET') {
    const review = await reviewByToken(new URL(req.url).searchParams.get('token'));
    const [{ data: artist }, { data: slots }] = await Promise.all([
      db.from('artists').select(PUBLIC_ARTIST).eq('id', review.artist_id).single(),
      db.from('availability').select('kind, date, weekday, start_time, end_time')
        .eq('owner_type', 'artist').eq('owner_id', review.artist_id)
        .or(`kind.eq.weekly,date.gte.${isoDate(todayNY())}`),
    ]);
    const [video_url, photo_url] = await Promise.all([signed(artist?.video_path ?? null), signed(artist?.photo_path ?? null)]);
    const { video_path: _v, photo_path: _p, ...profile } = artist ?? {};
    return json({
      artist: profile,
      video_url,
      photo_url,
      availability: slots ?? [],
      availability_summary: availabilitySummary((slots ?? []) as Slot[]),
      review: { verdict: review.verdict, room_fit: review.room_fit, note: review.note, done: Boolean(review.verdict) },
    });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'GET or POST');
  const body = await readJson<{ token?: string; verdict?: unknown; room_fit?: unknown; note?: unknown; terac_submission_id?: unknown }>(req);
  const review = await reviewByToken(body.token);
  const verdict = normalizeVerdict(body.verdict);
  const roomFit = (Array.isArray(body.room_fit) ? body.room_fit : typeof body.room_fit === 'string' ? body.room_fit.split(',') : [])
    .map(r => String(r).trim()).filter(Boolean).slice(0, MAX_ROOMS);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : null;
  const submissionId = typeof body.terac_submission_id === 'string' ? body.terac_submission_id.slice(0, 100) : null;

  // One answer per reviewer: a double submit or replay can't flip the verdict.
  // A second booker on the same review (different Terac submission) may still answer; the latest wins.
  const secondReviewer = submissionId && submissionId !== review.terac_submission_id;
  if (review.verdict && !secondReviewer) throw new HttpError(409, 'already reviewed, thank you');

  let update = db.from('expert_reviews').update({
    verdict, room_fit: roomFit, note, ...(submissionId && { terac_submission_id: submissionId }),
  }).eq('id', review.id);
  if (!review.verdict) update = update.is('verdict', null);
  const { data: changed, error } = await update.select('id');
  if (error) throw error;
  if (!changed?.length) throw new HttpError(409, 'already reviewed, thank you');

  const { data: artist } = await db.from('artists')
    .update({ vetting: verdict, vetting_note: note }).eq('id', review.artist_id).select('name').single();

  await log('vetting', 'vetting_verdict', {
    artist_id: review.artist_id, artist: artist?.name, verdict, room_fit: roomFit, note,
    terac_opportunity_id: review.terac_opportunity_id, terac_submission_id: submissionId,
  });
  return json({ ok: true });
});
