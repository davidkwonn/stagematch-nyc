// Seed 30 artists and 20 venues as real auth users, with calendars and vetting.
// Idempotent: re-running updates the same users and replaces their seeded availability.
//
//   npx deno run -A --env-file=.env scripts/seed.ts
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_PASSWORD (login for every seeded account), APP_URL.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const password = Deno.env.get('SEED_PASSWORD');
const appUrl = Deno.env.get('APP_URL') ?? '';
if (!url || !key || !password) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD in .env');
  Deno.exit(1);
}
const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

const WEEKS = 4;
const VERIFIED_COUNT = 10;
const PENDING_COUNT = 5;

// Deterministic pseudo-random so re-runs give the same data.
let state = 42;
const rand = () => ((state = (state * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const pickN = <T>(xs: T[], n: number): T[] => [...xs].sort(() => rand() - 0.5).slice(0, n);
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const GENRES = ['jazz', 'soul', 'r&b', 'indie rock', 'folk', 'singer-songwriter', 'hip hop', 'electronic', 'blues', 'latin', 'funk', 'punk', 'country', 'afrobeat'];
const EVENINGS: [string, string][] = [['19:00', '22:00'], ['20:00', '23:00'], ['21:00', '23:59'], ['18:00', '21:00'], ['20:00', '23:30']];

// Real NYC rooms, for a believable demo.
const VENUES: { name: string; type: string; borough: string; address: string; genres: string[]; capacity: number; budget: number }[] = [
  { name: 'Rockwood Music Hall', type: 'Music venue', borough: 'Manhattan', address: '196 Allen St', genres: ['singer-songwriter', 'folk', 'indie rock'], capacity: 250, budget: 300 },
  { name: 'Pianos', type: 'Bar', borough: 'Manhattan', address: '158 Ludlow St', genres: ['indie rock', 'punk', 'electronic'], capacity: 150, budget: 200 },
  { name: 'Mercury Lounge', type: 'Music venue', borough: 'Manhattan', address: '217 E Houston St', genres: ['indie rock', 'punk'], capacity: 250, budget: 350 },
  { name: 'Smalls Jazz Club', type: 'Jazz club', borough: 'Manhattan', address: '183 W 10th St', genres: ['jazz', 'blues'], capacity: 60, budget: 200 },
  { name: 'Nublu', type: 'Club', borough: 'Manhattan', address: '151 Avenue C', genres: ['jazz', 'electronic', 'afrobeat'], capacity: 200, budget: 250 },
  { name: "Baby's All Right", type: 'Music venue', borough: 'Brooklyn', address: '146 Broadway', genres: ['indie rock', 'electronic', 'r&b'], capacity: 280, budget: 400 },
  { name: 'Union Pool', type: 'Bar', borough: 'Brooklyn', address: '484 Union Ave', genres: ['indie rock', 'country', 'punk'], capacity: 200, budget: 250 },
  { name: 'Barbès', type: 'Bar', borough: 'Brooklyn', address: '376 9th St', genres: ['latin', 'jazz', 'afrobeat'], capacity: 80, budget: 150 },
  { name: 'Bar Lunàtico', type: 'Bar', borough: 'Brooklyn', address: '486 Halsey St', genres: ['jazz', 'soul', 'latin'], capacity: 60, budget: 150 },
  { name: "C'mon Everybody", type: 'Bar', borough: 'Brooklyn', address: '325 Franklin Ave', genres: ['soul', 'funk', 'r&b', 'hip hop'], capacity: 150, budget: 200 },
  { name: "Mona's", type: 'Bar', borough: 'Manhattan', address: '224 Avenue B', genres: ['jazz', 'blues'], capacity: 70, budget: 120 },
  { name: "Arlene's Grocery", type: 'Bar', borough: 'Manhattan', address: '95 Stanton St', genres: ['punk', 'indie rock'], capacity: 150, budget: 180 },
  { name: 'The Bitter End', type: 'Music venue', borough: 'Manhattan', address: '147 Bleecker St', genres: ['folk', 'singer-songwriter', 'blues'], capacity: 230, budget: 250 },
  { name: 'Bowery Electric', type: 'Bar', borough: 'Manhattan', address: '327 Bowery', genres: ['punk', 'indie rock', 'funk'], capacity: 200, budget: 220 },
  { name: 'Silvana', type: 'Bar', borough: 'Manhattan', address: '300 W 116th St', genres: ['afrobeat', 'latin', 'jazz'], capacity: 120, budget: 180 },
  { name: "Pete's Candy Store", type: 'Bar', borough: 'Brooklyn', address: '709 Lorimer St', genres: ['folk', 'singer-songwriter', 'country'], capacity: 50, budget: 100 },
  { name: "Sunny's Bar", type: 'Bar', borough: 'Brooklyn', address: '253 Conover St', genres: ['folk', 'country', 'blues'], capacity: 60, budget: 120 },
  { name: 'Friends and Lovers', type: 'Bar', borough: 'Brooklyn', address: '641 Classon Ave', genres: ['hip hop', 'r&b', 'electronic'], capacity: 150, budget: 200 },
  { name: 'Shrine', type: 'Bar', borough: 'Manhattan', address: '2271 Adam Clayton Powell Jr Blvd', genres: ['afrobeat', 'soul', 'funk'], capacity: 100, budget: 150 },
  { name: 'Terraza 7', type: 'Bar', borough: 'Queens', address: '40-19 Gleane St', genres: ['latin', 'jazz', 'afrobeat'], capacity: 90, budget: 150 },
];

const FIRST = ['Maya', 'Theo', 'Ines', 'Jules', 'Nia', 'Rafael', 'Odette', 'Kenji', 'Lila', 'Marcus', 'Sofia', 'Amara', 'Dario', 'Wren', 'Priya'];
const LAST = ['Okafor', 'Reyes', 'Lindqvist', 'Moreau', 'Baptiste', 'Kowalski', 'Haddad', 'Nakamura', 'Ferreira', 'Delgado'];
const BANDS = ['The Night Shifts', 'Velvet Static', 'Low Tide Choir', 'Brass Alley', 'Glass Pigeons', 'Second Avenue Saints', 'Paper Lanterns',
  'The Ludlow Quartet', 'Moth & Wire', 'Concrete Bloom', 'Orchard Street Social', 'Sugar Hill Hum', 'Copper Radio', 'The Late Trains', 'Halsey Hummingbirds'];
const BOROUGHS = ['Manhattan', 'Manhattan', 'Brooklyn', 'Brooklyn', 'Brooklyn', 'Queens', 'Bronx'];

const ARTISTS = Array.from({ length: 30 }, (_, i) => {
  const name = i % 2 === 0 ? BANDS[i / 2] : `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
  const genres = pickN(GENRES, 1 + Math.floor(rand() * 3));
  return {
    name,
    genres,
    borough: pick(BOROUGHS),
    rate: 75 + Math.round(rand() * 9) * 25, // $75–$300
    set: pick([45, 60, 60, 90]),
    background: `${name} ${i % 2 === 0 ? 'are a' : 'is a'} ${genres.join(' / ')} act playing around New York since ${2016 + (i % 8)}, ` +
      `with residencies at small rooms and a loyal neighborhood crowd.`,
  };
});

const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) + 'T00:00:00Z');
const isoDay = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

// Existing users by email, so re-runs reuse them.
async function existingUsers(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) out.set(u.email, u.id);
    if (data.users.length < 1000) return out;
  }
}

async function ensureUser(users: Map<string, string>, email: string, party: 'artist' | 'venue', name: string): Promise<string> {
  const id = users.get(email);
  if (id) {
    await db.auth.admin.updateUserById(id, { password, user_metadata: { party, name, seeded: true } });
    return id;
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { party, name, seeded: true } });
  if (error) throw error;
  return data.user.id;
}

// Evenings for the next WEEKS weeks: 1–2 weekly slots plus a few dated ones.
function calendar(ownerType: 'artist' | 'venue', ownerId: string) {
  const rows: Record<string, unknown>[] = [];
  // Venues always open Friday and Saturday evenings so every demo venue gets suggestions.
  const weekdays = ownerType === 'venue'
    ? [...new Set([5, 6, ...pickN([0, 1, 2, 3, 4], 1)])]
    : pickN([0, 1, 2, 3, 4, 5, 6], 1 + Math.floor(rand() * 2));
  for (const weekday of weekdays) {
    const [start_time, end_time] = pick(EVENINGS);
    rows.push({ owner_type: ownerType, owner_id: ownerId, kind: 'weekly', weekday, start_time, end_time, source: 'manual', note: 'seed' });
  }
  for (let i = 0; i < 3; i++) {
    const [start_time, end_time] = pick(EVENINGS);
    rows.push({ owner_type: ownerType, owner_id: ownerId, kind: 'date', date: isoDay(1 + Math.floor(rand() * WEEKS * 7)), start_time, end_time, source: 'manual', note: 'seed' });
  }
  return rows;
}

async function replaceCalendar(ownerType: 'artist' | 'venue', ownerId: string) {
  await db.from('availability').delete().eq('owner_type', ownerType).eq('owner_id', ownerId).eq('note', 'seed');
  const { error } = await db.from('availability').insert(calendar(ownerType, ownerId));
  if (error) throw error;
}

async function main() {
  const users = await existingUsers();
  const accounts: string[] = [];
  const reviewLinks: string[] = [];

  for (const [i, v] of VENUES.entries()) {
    const email = `venue-${slug(v.name)}@example.com`;
    const userId = await ensureUser(users, email, 'venue', v.name);
    const { data, error } = await db.from('venues').upsert({
      user_id: userId, name: v.name, venue_type: v.type, address: `${v.address}, New York, NY`, borough: v.borough,
      genres: v.genres, contact_name: `${pick(FIRST)} at ${v.name}`, email,
      start_date: isoDay(0), set_length_min: pick([45, 60, 60, 90]), budget_usd: v.budget, capacity: v.capacity,
      goals: `Fill ${i % 2 ? 'weeknight' : 'weekend'} slots with ${v.genres[0]} acts that bring a crowd.`,
      intake_completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select('id').single();
    if (error) throw error;
    await replaceCalendar('venue', data.id);
    accounts.push(`venue   ${email}`);
  }

  for (const [i, a] of ARTISTS.entries()) {
    const email = `artist-${slug(a.name)}@example.com`;
    const userId = await ensureUser(users, email, 'artist', a.name);
    const vetting = i < VERIFIED_COUNT ? 'verified' : i < VERIFIED_COUNT + PENDING_COUNT ? 'pending' : 'unverified';
    const { data, error } = await db.from('artists').upsert({
      user_id: userId, name: a.name, background: a.background, genres: a.genres, borough: a.borough, email,
      start_date: isoDay(0), set_length_min: a.set, rate_usd: a.rate,
      goals: 'Steady paid gigs in good rooms and new fans.',
      intake_completed_at: new Date().toISOString(),
      vetting,
      vetting_note: vetting === 'verified' ? 'Tight set, strong draw for its size; would book for a weekend slot.' : null,
    }, { onConflict: 'user_id' }).select('id').single();
    if (error) throw error;
    await replaceCalendar('artist', data.id);
    accounts.push(`artist  ${email}  (${vetting})`);

    if (vetting === 'unverified') continue;
    const { data: existing } = await db.from('expert_reviews').select('review_token').eq('artist_id', data.id).limit(1).maybeSingle();
    const review = existing ?? (await db.from('expert_reviews').insert({
      artist_id: data.id,
      ...(vetting === 'verified' && { verdict: 'verified', room_fit: ['listening room', 'cocktail bar'], note: 'Seeded: verified by NYC bookers.' }),
    }).select('review_token').single()).data;
    if (vetting === 'pending' && review) reviewLinks.push(`${a.name}: ${appUrl}/review/${review.review_token}`);
  }

  console.log(`Seeded ${VENUES.length} venues and ${ARTISTS.length} artists. Password for all: SEED_PASSWORD from .env\n`);
  console.log(accounts.join('\n'));
  console.log('\nPending reviews (Terac task links):\n' + reviewLinks.join('\n'));
}

await main();
