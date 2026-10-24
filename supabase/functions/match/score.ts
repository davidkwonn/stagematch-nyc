// Pure matching logic: expand calendars, find overlapping evening slots, score, explain.
// No I/O here so it can be unit-tested (score_test.ts).

import { addDays, formatTime, fromMinutes, isoDate, parseDate, toMinutes, usd, weekdayName } from '../_shared/format.ts';

export const WINDOW_DAYS = 42; // 6 weeks
export const DEFAULT_SET_MIN = 60;
const EVENING_START_MIN = 17 * 60; // a slot must start at 5 pm or later
const MAX_SUGGESTIONS = 5;

export type AvailabilityRow = {
  owner_id: string;
  kind: 'date' | 'weekly';
  date: string | null;
  weekday: number | null;
  start_time: string;
  end_time: string;
};

export type Venue = {
  id: string;
  name: string;
  borough: string | null;
  genres: string[];
  budget_usd: number | null;
  set_length_min: number | null;
  start_date: string | null;
};

export type Artist = {
  id: string;
  name: string;
  borough: string | null;
  genres: string[];
  rate_usd: number | null;
  start_date: string | null;
  vetting: string;
};

// One concrete evening on the calendar, minutes since midnight (end may pass 24h).
export type Window = { date: string; start: number; end: number };
export type Slot = { date: string; start: string; weekday: number };

export type Scored = {
  artist_id: string;
  score: number;
  reason: string;
  slot_date: string;
  slot_start: string;
};

// Dated rows as is, weekly rows on each matching weekday, within [from, from + days).
export function expand(rows: AvailabilityRow[], from: Date, days = WINDOW_DAYS, notBefore?: string | null): Window[] {
  const out: Window[] = [];
  const first = notBefore && parseDate(notBefore) > from ? parseDate(notBefore) : from;
  const last = addDays(from, days);
  for (const r of rows) {
    const start = toMinutes(r.start_time);
    let end = toMinutes(r.end_time);
    if (end <= start) end += 1440; // runs past midnight
    if (r.kind === 'date' && r.date) {
      const d = parseDate(r.date);
      if (d >= first && d < last) out.push({ date: r.date.slice(0, 10), start, end });
    } else if (r.kind === 'weekly' && r.weekday !== null) {
      for (let d = first; d < last; d = addDays(d, 1)) {
        if (d.getUTCDay() === r.weekday) out.push({ date: isoDate(d), start, end });
      }
    }
  }
  return out;
}

// Overlapping evening slots of at least `minLen` minutes, earliest first, one per date.
export function overlaps(venue: Window[], artist: Window[], minLen: number): Slot[] {
  const byDate = new Map<string, Window[]>();
  for (const w of artist) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w]);
  const best = new Map<string, number>();
  for (const v of venue) {
    for (const a of byDate.get(v.date) ?? []) {
      const start = Math.max(v.start, a.start, EVENING_START_MIN);
      const end = Math.min(v.end, a.end);
      if (end - start < minLen) continue;
      const prev = best.get(v.date);
      if (prev === undefined || start < prev) best.set(v.date, start);
    }
  }
  return [...best.entries()]
    .sort(([d1, s1], [d2, s2]) => d1.localeCompare(d2) || s1 - s2)
    .map(([date, start]) => ({ date, start: fromMinutes(start), weekday: parseDate(date).getUTCDay() }));
}

const norm = (s: string) => s.trim().toLowerCase();

const NEIGHBORS: Record<string, string[]> = {
  manhattan: ['brooklyn', 'queens', 'bronx'],
  brooklyn: ['manhattan', 'queens'],
  queens: ['manhattan', 'brooklyn', 'bronx'],
  bronx: ['manhattan', 'queens'],
  'staten island': ['brooklyn'],
};

export function boroughPoints(a: string | null, b: string | null): number {
  if (!a || !b) return 3;
  if (norm(a) === norm(b)) return 10;
  return NEIGHBORS[norm(a)]?.includes(norm(b)) ? 5 : 0;
}

// 0–100. Availability is required (caller filters artists with no slot).
export function scoreArtist(venue: Venue, artist: Artist, slots: Slot[]): { score: number; shared: string[] } {
  const venueGenres = new Set(venue.genres.map(norm));
  const shared = artist.genres.filter(g => venueGenres.has(norm(g)));

  const availability = 25 + Math.min(slots.length, 5) * 2; // 27–35
  const genre = venueGenres.size === 0 ? 10 : shared.length === 0 ? 0 : Math.min(25, 15 + (shared.length - 1) * 5);
  let pay = 10;
  if (artist.rate_usd != null && venue.budget_usd != null) {
    pay = artist.rate_usd <= venue.budget_usd ? 20 : artist.rate_usd <= venue.budget_usd * 1.2 ? 6 : 0;
  }
  const borough = boroughPoints(venue.borough, artist.borough);
  const verified = artist.vetting === 'verified' ? 10 : 0;

  return { score: Math.min(100, availability + genre + pay + borough + verified), shared };
}

const plural = (day: string) => `${day}s`;

// "Plays jazz and soul, free Fridays 9 pm, $150 within your $200 budget, verified by NYC bookers"
export function explain(venue: Venue, artist: Artist, slots: Slot[], shared: string[]): string {
  const parts: string[] = [];
  const genres = (shared.length ? shared : artist.genres).slice(0, 2);
  if (genres.length) parts.push(`Plays ${genres.join(' and ')}`);

  const first = slots[0];
  const sameWeekday = slots.filter(s => s.weekday === first.weekday).length >= 2;
  const day = weekdayName(first.weekday);
  parts.push(`free ${sameWeekday ? plural(day) : day} ${formatTime(first.start)}`);

  if (artist.rate_usd != null && venue.budget_usd != null) {
    parts.push(artist.rate_usd <= venue.budget_usd
      ? `${usd(artist.rate_usd)} within your ${usd(venue.budget_usd)} budget`
      : `${usd(artist.rate_usd)}, a little over your ${usd(venue.budget_usd)} budget`);
  } else if (artist.rate_usd != null) {
    parts.push(`asks ${usd(artist.rate_usd)}`);
  }

  if (artist.vetting === 'verified') parts.push('verified by NYC bookers');
  return parts.join(', ');
}

export type MatchInput = {
  venue: Venue;
  venueAvailability: AvailabilityRow[];
  artists: Artist[];
  artistAvailability: AvailabilityRow[];
  exclude: Set<string>; // artist ids the venue already answered
  today: Date;
  venueBooked?: Set<string>; // dates this venue already has a confirmed gig
  artistBooked?: Map<string, Set<string>>; // artist id → dates already booked anywhere
};

export function rank(input: MatchInput, limit = MAX_SUGGESTIONS): Scored[] {
  const { venue, today } = input;
  const minLen = venue.set_length_min ?? DEFAULT_SET_MIN;
  const venueBooked = input.venueBooked ?? new Set<string>();
  const venueWindows = expand(input.venueAvailability, today, WINDOW_DAYS, venue.start_date)
    .filter(w => !venueBooked.has(w.date));
  if (!venueWindows.length) return [];

  const rowsByArtist = new Map<string, AvailabilityRow[]>();
  for (const r of input.artistAvailability) rowsByArtist.set(r.owner_id, [...(rowsByArtist.get(r.owner_id) ?? []), r]);

  const scored: Scored[] = [];
  for (const artist of input.artists) {
    if (input.exclude.has(artist.id)) continue;
    const booked = input.artistBooked?.get(artist.id);
    const windows = expand(rowsByArtist.get(artist.id) ?? [], today, WINDOW_DAYS, artist.start_date)
      .filter(w => !booked?.has(w.date));
    const slots = overlaps(venueWindows, windows, minLen);
    if (!slots.length) continue;
    const { score, shared } = scoreArtist(venue, artist, slots);
    scored.push({
      artist_id: artist.id,
      score,
      reason: explain(venue, artist, slots, shared),
      slot_date: slots[0].date,
      slot_start: slots[0].start,
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.slot_date.localeCompare(b.slot_date))
    .slice(0, limit);
}
