// deno test supabase/functions/match/score_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { parseDate } from '../_shared/format.ts';
import { type Artist, type AvailabilityRow, expand, explain, overlaps, rank, scoreArtist, type Venue } from './score.ts';

// Friday Oct 24 2026
const TODAY = parseDate('2026-10-24');

const venue: Venue = {
  id: 'v1', name: 'Pianos', borough: 'Manhattan', genres: ['jazz', 'soul'],
  budget_usd: 200, set_length_min: 60, start_date: null,
};

const artist = (id: string, over: Partial<Artist> = {}): Artist => ({
  id, name: id, borough: 'Manhattan', genres: ['jazz'], rate_usd: 150, start_date: null, vetting: 'unverified', ...over,
});

const weekly = (owner_id: string, weekday: number, start = '19:00', end = '23:00'): AvailabilityRow =>
  ({ owner_id, kind: 'weekly', date: null, weekday, start_time: start, end_time: end });
const dated = (owner_id: string, date: string, start = '19:00', end = '23:00'): AvailabilityRow =>
  ({ owner_id, kind: 'date', date, weekday: null, start_time: start, end_time: end });

Deno.test('expand puts weekly rows on every matching weekday for 6 weeks', () => {
  const windows = expand([weekly('a', 5)], TODAY);
  assertEquals(windows.length, 6);
  assertEquals(windows[0].date, '2026-10-30');
});

Deno.test('expand keeps dated rows inside the window and respects start_date', () => {
  const rows = [dated('a', '2026-10-25'), dated('a', '2027-02-01'), dated('a', '2026-10-20')];
  assertEquals(expand(rows, TODAY).map(w => w.date), ['2026-10-25']);
  assertEquals(expand([weekly('a', 5)], TODAY, 42, '2026-11-01')[0].date, '2026-11-06');
});

Deno.test('overlaps requires the full set length and an evening start', () => {
  const v = expand([dated('v', '2026-10-30', '20:00', '23:00')], TODAY);
  assertEquals(overlaps(v, expand([dated('a', '2026-10-30', '22:30', '23:59')], TODAY), 60), []);
  assertEquals(overlaps(v, expand([dated('a', '2026-10-30', '21:00', '23:00')], TODAY), 60)[0].start, '21:00');
  const afternoon = expand([dated('v', '2026-10-30', '12:00', '18:00')], TODAY);
  assertEquals(overlaps(afternoon, expand([dated('a', '2026-10-30', '12:00', '18:00')], TODAY), 60)[0].start, '17:00');
});

Deno.test('overlaps handles slots that run past midnight', () => {
  const v = expand([dated('v', '2026-10-30', '22:00', '02:00')], TODAY);
  const a = expand([dated('a', '2026-10-30', '23:00', '01:00')], TODAY);
  assertEquals(overlaps(v, a, 90)[0].start, '23:00');
});

Deno.test('score rewards genre, pay, borough and verification', () => {
  const slots = [{ date: '2026-10-30', start: '21:00', weekday: 5 }];
  const verified = scoreArtist(venue, artist('a', { vetting: 'verified', genres: ['jazz', 'soul'] }), slots).score;
  const plain = scoreArtist(venue, artist('b'), slots).score;
  const pricey = scoreArtist(venue, artist('c', { rate_usd: 500, genres: ['metal'], borough: 'Staten Island' }), slots).score;
  assert(verified > plain && plain > pricey);
  assert(verified <= 100 && pricey >= 0);
});

Deno.test('explain reads like the spec example', () => {
  const slots = [
    { date: '2026-10-30', start: '21:00', weekday: 5 },
    { date: '2026-11-06', start: '21:00', weekday: 5 },
  ];
  const a = artist('a', { genres: ['jazz', 'soul'], vetting: 'verified' });
  assertEquals(explain(venue, a, slots, ['jazz', 'soul']),
    'Plays jazz and soul, free Fridays 9 pm, $150 within your $200 budget, verified by NYC bookers');
});

Deno.test('rank keeps the top 5, skips no-overlap and already suggested artists', () => {
  const artists = Array.from({ length: 8 }, (_, i) => artist(`a${i}`, { rate_usd: 100 + i * 20 }));
  const availability = [...artists.map(a => weekly(a.id, 5)), weekly('nobody', 2)];
  const result = rank({
    venue,
    venueAvailability: [weekly('v1', 5, '20:00', '23:00')],
    artists: [...artists, artist('nobody')],
    artistAvailability: availability,
    exclude: new Set(['a0']),
    today: TODAY,
  });
  assertEquals(result.length, 5);
  assert(!result.some(r => r.artist_id === 'a0' || r.artist_id === 'nobody'));
  assertEquals(result[0].slot_date, '2026-10-30');
  assertEquals(result[0].slot_start, '20:00');
  assert(result.every((r, i) => i === 0 || result[i - 1].score >= r.score));
});

Deno.test('rank skips nights already booked by the artist or the venue', () => {
  const base = {
    venue,
    venueAvailability: [weekly('v1', 5, '20:00', '23:00')],
    artists: [artist('a')],
    artistAvailability: [weekly('a', 5)],
    exclude: new Set<string>(),
    today: TODAY,
  };
  assertEquals(rank(base)[0].slot_date, '2026-10-30');
  assertEquals(rank({ ...base, artistBooked: new Map([['a', new Set(['2026-10-30'])]]) })[0].slot_date, '2026-11-06');
  assertEquals(rank({ ...base, venueBooked: new Set(['2026-10-30', '2026-11-06']) })[0].slot_date, '2026-11-13');
});

Deno.test('rank returns nothing when the venue has no calendar', () => {
  assertEquals(rank({ venue, venueAvailability: [], artists: [artist('a')], artistAvailability: [weekly('a', 5)], exclude: new Set(), today: TODAY }), []);
});
