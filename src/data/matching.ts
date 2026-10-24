// Stagehand matching: expand calendars, find overlapping evening slots, score 0–100, explain.
// Pure functions (no I/O), used by the `match` action in backend.server.ts and by tests.
// Same logic as supabase/functions/match/score.ts.

export const WINDOW_DAYS = 42; // 6 weeks
export const DEFAULT_SET_MIN = 60;
export const MAX_SUGGESTIONS = 5;
// A confirmed (or later) booking takes the night for both the artist and the venue.
export const BOOKED_STATUSES = ["confirmed", "paid_held", "performed", "released"] as const;
const EVENING_START_MIN = 17 * 60;
const DAY_MS = 86_400_000;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type AvailabilityRow = {
  owner_id: string;
  kind: "date" | "weekly";
  date: string | null;
  weekday: number | null;
  start_time: string;
  end_time: string;
};

export type MatchVenue = {
  borough: string | null;
  genres: string[];
  budget_usd: number | null;
  set_length_min: number | null;
  start_date: string | null;
};

export type MatchArtist = {
  id: string;
  borough: string | null;
  genres: string[];
  rate_usd: number | null;
  start_date: string | null;
  vetting: string;
};

type Window = { date: string; start: number; end: number };
export type Slot = { date: string; start: string; weekday: number };
export type Scored = {
  artist_id: string;
  score: number;
  reason: string;
  slot_date: string;
  slot_start: string;
};

// Dates as 'YYYY-MM-DD' at UTC midnight: calendar math only, no time zone drift.
const parseDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

// Today's date in New York, where every gig happens.
export function todayNY(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

const toMinutes = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (min: number) => {
  const w = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`;
};
export function formatTime(t: string): string {
  const min = toMinutes(t);
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
}
const usd = (n: number) => `$${n}`;

// Dated rows as is, weekly rows on each matching weekday, within [from, from + days).
export function expand(
  rows: AvailabilityRow[],
  from: string,
  days = WINDOW_DAYS,
  notBefore?: string | null,
): Window[] {
  const out: Window[] = [];
  const start = parseDate(from);
  const first = notBefore && parseDate(notBefore) > start ? parseDate(notBefore) : start;
  const last = addDays(start, days);
  for (const r of rows) {
    const s = toMinutes(r.start_time);
    let e = toMinutes(r.end_time);
    if (e <= s) e += 1440; // runs past midnight
    if (r.kind === "date" && r.date) {
      const d = parseDate(r.date);
      if (d >= first && d < last) out.push({ date: r.date.slice(0, 10), start: s, end: e });
    } else if (r.kind === "weekly" && r.weekday !== null) {
      for (let d = first; d < last; d = addDays(d, 1)) {
        if (d.getUTCDay() === r.weekday) out.push({ date: isoDate(d), start: s, end: e });
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
      const s = Math.max(v.start, a.start, EVENING_START_MIN);
      const e = Math.min(v.end, a.end);
      if (e - s < minLen) continue;
      const prev = best.get(v.date);
      if (prev === undefined || s < prev) best.set(v.date, s);
    }
  }
  return [...best.entries()]
    .sort(([d1, s1], [d2, s2]) => d1.localeCompare(d2) || s1 - s2)
    .map(([date, s]) => ({ date, start: fromMinutes(s), weekday: parseDate(date).getUTCDay() }));
}

const norm = (s: string) => s.trim().toLowerCase();
const NEIGHBORS: Record<string, string[]> = {
  manhattan: ["brooklyn", "queens", "bronx"],
  brooklyn: ["manhattan", "queens"],
  queens: ["manhattan", "brooklyn", "bronx"],
  bronx: ["manhattan", "queens"],
  "staten island": ["brooklyn"],
};

export function boroughPoints(a: string | null, b: string | null): number {
  if (!a || !b) return 3;
  if (norm(a) === norm(b)) return 10;
  return NEIGHBORS[norm(a)]?.includes(norm(b)) ? 5 : 0;
}

// 0–100: shared nights 27–35, genres up to 25, pay fit 20, borough 10, verified 10.
export function scoreArtist(
  venue: MatchVenue,
  artist: MatchArtist,
  slots: Slot[],
): { score: number; shared: string[] } {
  const venueGenres = new Set(venue.genres.map(norm));
  const shared = artist.genres.filter((g) => venueGenres.has(norm(g)));
  const availability = 25 + Math.min(slots.length, 5) * 2;
  const genre =
    venueGenres.size === 0
      ? 10
      : shared.length === 0
        ? 0
        : Math.min(25, 15 + (shared.length - 1) * 5);
  let pay = 10;
  if (artist.rate_usd != null && venue.budget_usd != null) {
    pay =
      artist.rate_usd <= venue.budget_usd ? 20 : artist.rate_usd <= venue.budget_usd * 1.2 ? 6 : 0;
  }
  const verified = artist.vetting === "verified" ? 10 : 0;
  return {
    score: Math.min(
      100,
      availability + genre + pay + boroughPoints(venue.borough, artist.borough) + verified,
    ),
    shared,
  };
}

// "Plays jazz and soul, free Fridays 9 pm, $150 within your $200 budget, verified by NYC bookers"
export function explain(
  venue: MatchVenue,
  artist: MatchArtist,
  slots: Slot[],
  shared: string[],
): string {
  const parts: string[] = [];
  const genres = (shared.length ? shared : artist.genres).slice(0, 2);
  if (genres.length) parts.push(`Plays ${genres.join(" and ")}`);
  const first = slots[0];
  if (first) {
    const recurring = slots.filter((s) => s.weekday === first.weekday).length >= 2;
    parts.push(
      `free ${WEEKDAYS[first.weekday] ?? ""}${recurring ? "s" : ""} ${formatTime(first.start)}`,
    );
  }
  if (artist.rate_usd != null && venue.budget_usd != null) {
    parts.push(
      artist.rate_usd <= venue.budget_usd
        ? `${usd(artist.rate_usd)} within your ${usd(venue.budget_usd)} budget`
        : `${usd(artist.rate_usd)}, a little over your ${usd(venue.budget_usd)} budget`,
    );
  } else if (artist.rate_usd != null) {
    parts.push(`asks ${usd(artist.rate_usd)}`);
  }
  if (artist.vetting === "verified") parts.push("verified by NYC bookers");
  return parts.join(", ");
}

export type MatchInput = {
  venue: MatchVenue;
  venueAvailability: AvailabilityRow[];
  artists: MatchArtist[];
  artistAvailability: AvailabilityRow[];
  exclude: Set<string>; // artists the venue already answered
  today: string; // 'YYYY-MM-DD'
  venueBooked?: Set<string> | undefined; // nights this venue already has a confirmed gig
  artistBooked?: Map<string, Set<string>> | undefined; // artist id → nights booked anywhere
};

// Top artists for a venue: at least one shared free evening, never a booked night, best first.
export function rank(input: MatchInput, limit = MAX_SUGGESTIONS): Scored[] {
  const { venue, today } = input;
  const minLen = venue.set_length_min ?? DEFAULT_SET_MIN;
  const venueBooked = input.venueBooked ?? new Set<string>();
  const venueWindows = expand(input.venueAvailability, today, WINDOW_DAYS, venue.start_date).filter(
    (w) => !venueBooked.has(w.date),
  );
  if (!venueWindows.length) return [];

  const rowsByArtist = new Map<string, AvailabilityRow[]>();
  for (const r of input.artistAvailability)
    rowsByArtist.set(r.owner_id, [...(rowsByArtist.get(r.owner_id) ?? []), r]);

  const scored: Scored[] = [];
  for (const artist of input.artists) {
    if (input.exclude.has(artist.id) || artist.vetting === "rejected") continue;
    const booked = input.artistBooked?.get(artist.id);
    const windows = expand(
      rowsByArtist.get(artist.id) ?? [],
      today,
      WINDOW_DAYS,
      artist.start_date,
    ).filter((w) => !booked?.has(w.date));
    const slots = overlaps(venueWindows, windows, minLen);
    const first = slots[0];
    if (!first) continue;
    const { score, shared } = scoreArtist(venue, artist, slots);
    scored.push({
      artist_id: artist.id,
      score,
      reason: explain(venue, artist, slots, shared),
      slot_date: first.date,
      slot_start: first.start,
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.slot_date.localeCompare(b.slot_date))
    .slice(0, limit);
}

// Booked nights by artist and by venue, from booking rows already filtered to BOOKED_STATUSES.
export function bookedNights(
  rows: { artist_id: string; venue_id: string; gig_date: string | null }[],
) {
  const artist = new Map<string, Set<string>>();
  const venue = new Map<string, Set<string>>();
  for (const b of rows) {
    if (!b.gig_date) continue;
    artist.set(b.artist_id, (artist.get(b.artist_id) ?? new Set()).add(b.gig_date));
    venue.set(b.venue_id, (venue.get(b.venue_id) ?? new Set()).add(b.gig_date));
  }
  return { artist, venue };
}
