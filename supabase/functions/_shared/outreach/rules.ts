// Outreach sourcing rules: query matrices, filters and scoring. Pure functions (no I/O),
// unit-tested in rules_test.ts. Artist filters F1–F8 follow docs/outreach/artist-sourcing-brief.md.
// Venues are steered to bars: emerging artists fit small bars first.

export type Kind = 'artist' | 'venue';
export type RawResult = { url: string; title?: string | null; text?: string | null; publishedDate?: string | null };
export type Query = { kind: Kind; text: string; borough: string; genre?: string; includeDomains?: string[] };
export type LeadDraft = {
  kind: Kind;
  name: string;
  source: 'bandcamp' | 'soundcloud' | 'web';
  source_url: string;
  borough: string | null;
  genre: string | null;
  venue_type: string | null;
  bio_snippet: string;
  email: string | null;
  contact_type: 'email' | 'contact_form';
  score: number;
  status: 'new' | 'approved';
  found_by_query: string;
};
export type Verdict = { lead: LeadDraft } | { reject: string };

export const AUTO_APPROVE_SCORE = 70;
const BIO_CHARS = 280;
const MAX_CAPACITY = 300;

// ---------------------------------------------------------------- query matrices

export const BOROUGHS = ['Brooklyn', 'Manhattan', 'Queens', 'Bronx', 'Staten Island'] as const;

export const GENRES: Record<string, { label: string; terms: string[]; match: RegExp }> = {
  singer_songwriter: { label: 'singer-songwriter', terms: ['singer-songwriter', 'acoustic'], match: /singer[- ]?songwriter|acoustic|folk|americana/i },
  jazz_soul_rnb: { label: 'jazz, soul and R&B', terms: ['jazz', 'soul R&B'], match: /\bjazz\b|\bsoul\b|r&b|\brnb\b|neo[- ]soul|funk/i },
  dj_electronic: { label: 'DJ and electronic', terms: ['DJ', 'electronic'], match: /\bdj\b|electronic|house|techno|disco|ambient|beats/i },
  indie_rock: { label: 'indie and rock', terms: ['indie rock band', 'rock band'], match: /\bindie\b|\brock\b|punk|garage|shoegaze|post-punk|\bband\b/i },
};

export const ARTIST_DOMAINS = ['bandcamp.com', 'soundcloud.com'];

// Borough × genre: e.g. "Brooklyn NYC jazz artist" on Bandcamp and SoundCloud.
export function artistQueries(): Query[] {
  const out: Query[] = [];
  for (const term of [0, 1]) {
    for (const borough of BOROUGHS) {
      for (const [genre, g] of Object.entries(GENRES)) {
        out.push({ kind: 'artist', borough, genre, text: `${borough} NYC ${g.terms[term]} artist`, includeDomains: ARTIST_DOMAINS });
      }
    }
  }
  return out;
}

export const NEIGHBORHOODS: [string, string][] = [
  ['Bushwick', 'Brooklyn'], ['Lower East Side', 'Manhattan'], ['Williamsburg', 'Brooklyn'], ['East Village', 'Manhattan'],
  ['Astoria', 'Queens'], ['Bed-Stuy', 'Brooklyn'], ['Harlem', 'Manhattan'], ['Ridgewood', 'Queens'],
  ['Greenpoint', 'Brooklyn'], ['West Village', 'Manhattan'], ['Crown Heights', 'Brooklyn'], ['Long Island City', 'Queens'],
  ['Mott Haven', 'Bronx'], ['Park Slope', 'Brooklyn'], ["Hell's Kitchen", 'Manhattan'], ['Jackson Heights', 'Queens'],
  ['Clinton Hill', 'Brooklyn'], ['St. George Staten Island', 'Staten Island'], ['South Bronx', 'Bronx'], ['Gowanus', 'Brooklyn'],
];

// Bars first: neighbourhood × bar type, then the wider small-venue type last.
export const VENUE_TYPES = [
  'bar live music booking email',
  'cocktail bar jazz night booking',
  'dive bar live bands book a show',
  'wine bar acoustic night booking',
  'lounge DJ night booking email',
  'small music venue book a show',
];

export function venueQueries(): Query[] {
  const out: Query[] = [];
  for (const type of VENUE_TYPES) {
    for (const [hood, borough] of NEIGHBORHOODS) out.push({ kind: 'venue', borough, text: `${hood} ${type}` });
  }
  return out;
}

// The slice of the matrix for run number `runIndex`: the cron walks the matrix over time.
export function slice<T>(all: T[], runIndex: number, size: number): T[] {
  if (!all.length) return [];
  const start = (runIndex * size) % all.length;
  return Array.from({ length: Math.min(size, all.length) }, (_, i) => all[(start + i) % all.length]);
}

// ---------------------------------------------------------------- text helpers

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const FAKE_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|domain|email|mysite|yoursite|website|test)\.|^(noreply|no-reply|donotreply|your-?email|name)@|@(bandcamp|soundcloud)\.com$/i;

export function extractEmails(text: string): string[] {
  const found = (text.match(EMAIL_RE) ?? []).map(e => e.toLowerCase().replace(/[.,;:]+$/, ''));
  return [...new Set(found.filter(e => !FAKE_EMAIL.test(e)))];
}

const BOOKING_LOCAL = /^(booking|bookings|book|events?|music|shows?|entertainment|talent|live|gigs?)\b/;
const GENERIC_LOCAL = /^(info|hello|contact|hi|team|office)\b/;

// Prefer a booking address, then a general one, then any other public address on the page.
export function bookingEmail(text: string): string | null {
  const emails = extractEmails(text);
  const local = (e: string) => e.split('@')[0];
  return emails.find(e => BOOKING_LOCAL.test(local(e))) ?? emails.find(e => GENERIC_LOCAL.test(local(e))) ?? emails[0] ?? null;
}

const SOUNDCLOUD_RESERVED = new Set(['discover', 'search', 'charts', 'stations', 'you', 'pages', 'mobile', 'upload', 'tags', 'popular', 'people', 'terms-of-use', 'jobs']);

// Canonical page per lead: artist root on Bandcamp/SoundCloud, origin + path for the web.
export function normalizeUrl(raw: string): { url: string; source: LeadDraft['source'] } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host.endsWith('.bandcamp.com') && host !== 'daily.bandcamp.com') return { url: `https://${host}/`, source: 'bandcamp' };
  if (host === 'bandcamp.com') return null;
  if (host === 'soundcloud.com' || host === 'm.soundcloud.com') {
    const user = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    if (!user || SOUNDCLOUD_RESERVED.has(user)) return null;
    return { url: `https://soundcloud.com/${user}`, source: 'soundcloud' };
  }
  const path = u.pathname.replace(/\/+$/, '');
  return { url: `https://${host}${path}`, source: 'web' };
}

const NEIGHBORHOOD_BOROUGH: [RegExp, string][] = [
  [/\bbrooklyn\b|bushwick|williamsburg|greenpoint|bed[- ]?stuy|crown heights|park slope|gowanus|clinton hill|flatbush|red hook|prospect/i, 'Brooklyn'],
  [/\bqueens\b|astoria|ridgewood|long island city|\blic\b|jackson heights|flushing|sunnyside|woodside/i, 'Queens'],
  [/\bbronx\b|mott haven|fordham|riverdale|arthur avenue/i, 'Bronx'],
  [/staten island|st\.? george/i, 'Staten Island'],
  [/\bmanhattan\b|harlem|lower east side|east village|west village|soho|tribeca|hell'?s kitchen|chelsea|midtown|chinatown/i, 'Manhattan'],
];

export function detectBorough(text: string): string | null {
  for (const [re, borough] of NEIGHBORHOOD_BOROUGH) if (re.test(text)) return borough;
  return /\bnyc\b|new york city|new york,? ny/i.test(text) ? 'NYC' : null;
}

const NYC_RE = /\bnyc\b|new york|brooklyn|queens|\bbronx\b|staten island|manhattan|harlem|bushwick|williamsburg|astoria|ridgewood/i;
const NYC_ADDRESS_RE = /\b(new york|brooklyn|queens|bronx|staten island|astoria|long island city|flushing|ridgewood|jackson heights),?\s+(ny|new york)\b|\bny\s+1(0[0-4]|1[0-6])\d{2}\b/i;

// Activity from the years a page mentions: recent = this year or last; stale = only years
// older than two years. A page that shows no year is unknown (neither).
export function activity(text: string, publishedDate: string | null | undefined, now: Date): { recent: boolean; stale: boolean } {
  const year = now.getUTCFullYear();
  const years = (text.match(/\b20\d{2}\b/g) ?? []).map(Number).filter(y => y <= year);
  const published = publishedDate ? new Date(publishedDate).getUTCFullYear() : NaN;
  if (Number.isFinite(published)) years.push(published);
  if (!years.length) return { recent: false, stale: false };
  const latest = Math.max(...years);
  return { recent: latest >= year - 1, stale: latest < year - 2 };
}
const recent = (text: string, publishedDate: string | null | undefined, now: Date) => activity(text, publishedDate, now).recent;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const snippet = (text: string) => clean(text).slice(0, BIO_CHARS);

// "Music | Cheryl Richards" → "Cheryl Richards"; "Stream X music | Listen to songs…" → "X"
export function artistName(title: string): string {
  const t = clean(title);
  const stream = t.match(/^Stream (.+?) music\b/i);
  if (stream) return stream[1];
  const parts = t.split('|').map(s => s.trim()).filter(Boolean);
  const name = parts.length > 1 && /^music$/i.test(parts[0]) ? parts[1] : (parts[0] ?? t);
  return name.replace(/[’']s community$/i, '').trim();
}

const GENERIC_TITLE = /^(home|contact( us)?|about( us)?|faq|booking( \/ backline)?|band booking|book the bar|bookings?|events?|calendar|live music.*|music( event)?s?|menu|private events|hours|location|info|welcome)$/i;

// The venue's name from the page title, skipping generic page names ("Contact Us", "FAQ");
// falls back to the site's domain (thetrashbar.com → Thetrashbar).
export function venueName(title: string, host = ''): string {
  const parts = clean(title).split(/\s*[|–—«»:]\s*|\s+-\s+/)
    .map(s => s.trim().replace(/^(live music|music|shows?|events?) at\s+/i, '').replace(/^(contact|about|book|visit)\s+(?=\S)/i, ''))
    .filter(Boolean);
  const named = parts.find(p => !GENERIC_TITLE.test(p) && p.length > 2);
  if (named) return named;
  const label = host.replace(/^www\./, '').split('.')[0] ?? '';
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : clean(title);
}

// ---------------------------------------------------------------- artists (F1–F8)

const LABEL_RE = /\b(records|recordings|label|collective|promotions|presents|booking agency|management|radio|podcast)\b/i;
const MAJOR_LABEL_RE = /\b(columbia records|atlantic records|def jam|interscope|capitol records|rca records|republic records|warner records|sony music|universal music)\b/i;

export function scoreArtist(input: { nyc: boolean; email: boolean; genreFit: boolean; recent: boolean; bio: string }): number {
  return (input.nyc ? 30 : 0) + (input.email ? 25 : 0) + (input.genreFit ? 20 : 0) + (input.recent ? 15 : 0) + (input.bio.length >= 200 ? 10 : 0);
}

export function judgeArtist(r: RawResult, q: Query, now = new Date()): Verdict {
  const page = normalizeUrl(r.url);
  // F1: an artist page on Bandcamp or SoundCloud only (no marketplaces, no social networks).
  if (!page || page.source === 'web') return { reject: 'F1_source' };
  const title = clean(r.title ?? '');
  const text = `${title}\n${r.text ?? ''}`;
  const name = artistName(title);
  if (!name) return { reject: 'F1_source' };
  // F2: NYC evidence on the page.
  const nyc = NYC_RE.test(text);
  if (!nyc) return { reject: 'F2_not_nyc' };
  // F3: an artist, not a label, collective, promoter or show.
  if (LABEL_RE.test(name)) return { reject: 'F3_not_artist' };
  // F4: emerging, not signed to a major label.
  if (MAJOR_LABEL_RE.test(text)) return { reject: 'F4_major_label' };
  // F5: not inactive (a page whose latest year is over two years old); unknown passes without points.
  const act = activity(text, r.publishedDate, now);
  if (act.stale) return { reject: 'F5_inactive' };
  const isRecent = act.recent;
  // F6: fits one of our four genre groups.
  const genre = q.genre && GENRES[q.genre]?.match.test(text) ? q.genre : Object.entries(GENRES).find(([, g]) => g.match.test(text))?.[0];
  if (!genre) return { reject: 'F6_genre' };
  // F7: a public contact posted for booking; without one the lead is kept as contact_form and never emailed.
  const email = bookingEmail(r.text ?? '');
  // F8 (dedupe and do_not_contact) runs against the database in outreach-run.
  const bio = snippet(r.text ?? '');
  const score = scoreArtist({ nyc, email: Boolean(email), genreFit: true, recent: isRecent, bio });
  return {
    lead: {
      kind: 'artist', name, source: page.source, source_url: page.url,
      borough: detectBorough(text) ?? q.borough, genre, venue_type: null, bio_snippet: bio,
      email, contact_type: email ? 'email' : 'contact_form', score,
      status: email && score >= AUTO_APPROVE_SCORE ? 'approved' : 'new', found_by_query: q.text,
    },
  };
}

// ---------------------------------------------------------------- venues (bars first)

const DIRECTORY_HOSTS = /(^|\.)(yelp|timeout|tripadvisor|foursquare|facebook|instagram|tiktok|twitter|x|eventbrite|opentable|resy|theinfatuation|eater|nymag|secretnyc|thrillist|songkick|bandsintown|dice|ra|google|wikipedia|reddit|yellowpages|mapquest|untappd|partyslate|peerspace|tagvenue|giggster|splacer|gigsalad|thebash|bookingagentinfo|youtube|linkedin|nytimes|villagevoice|brooklynvegan|ohmyrockness|donyc|allevents|feverup)\.(com|co|fm|org|net)$/i;
const LISTICLE_RE = /^(the )?(\d+ )?(best|top \d+|\d+ best|guide to|where to)\b/i;
const CHAIN_RE = /\b(applebee'?s|tgi friday'?s|hard rock cafe|dave (&|and) buster'?s|buffalo wild wings|chili'?s|olive garden|house of blues|city winery|bowlero|punch bowl social|hooters)\b/i;
const AGENCY_RE = /\b(booking agency|talent agency|management company|entertainment agency|event planning|dj services|hire a (band|dj)|wedding band)\b/i;
const LIVE_MUSIC_RE = /\blive music\b|\blive band|\bjazz night|\bopen mic|\bdj night|\bdj set|\bperformers?\b|\bconcerts?\b|\bshows?\b|\bgigs?\b/i;

export type VenueType = 'bar' | 'restaurant_cafe' | 'music_venue' | 'other';

export function venueType(text: string): VenueType {
  const head = text.slice(0, 800);
  if (/\b(bar|pub|tavern|saloon|lounge|wine bar|cocktail|taproom|speakeasy|dive)\b/i.test(head)) return 'bar';
  if (/\b(restaurant|caf[eé]|coffee|bistro|brewery|kitchen)\b/i.test(head)) return 'restaurant_cafe';
  if (/\b(music venue|concert hall|theater|theatre|club)\b/i.test(head)) return 'music_venue';
  return 'other';
}

// Bars score highest: they are where emerging artists get booked first.
const TYPE_POINTS: Record<VenueType, number> = { bar: 25, restaurant_cafe: 12, music_venue: 10, other: 5 };

export function statedCapacity(text: string): number | null {
  const m = text.match(/capacity[^0-9]{0,20}(\d{2,4})|(\d{2,4})\s*(?:-|\s)?(?:person|people|guests?)\s*(?:capacity|max)/i);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) ? n : null;
}

// 0–100: NYC address 25, booking email 25 (a general one 15), venue type up to 25, live music 15, recent 10.
export function scoreVenue(input: { nycAddress: boolean; email: 'booking' | 'general'; type: VenueType; liveMusic: boolean; recent: boolean }): number {
  return (input.nycAddress ? 25 : 0) + (input.email === 'booking' ? 25 : 15) + TYPE_POINTS[input.type] + (input.liveMusic ? 15 : 0) + (input.recent ? 10 : 0);
}

export function judgeVenue(r: RawResult, q: Query, now = new Date()): Verdict {
  const page = normalizeUrl(r.url);
  if (!page) return { reject: 'V_bad_url' };
  const host = new URL(page.url).hostname;
  const title = clean(r.title ?? '');
  const text = `${title}\n${r.text ?? ''}`;
  // Directories, listings, social networks and marketplaces are sources of leads, never leads.
  if (page.source !== 'web' || DIRECTORY_HOSTS.test(host) || LISTICLE_RE.test(title)) return { reject: 'V1_directory' };
  if (!NYC_ADDRESS_RE.test(text)) return { reject: 'V2_no_nyc_address' };
  const email = bookingEmail(r.text ?? '');
  if (!email) return { reject: 'V3_no_booking_email' };
  if (CHAIN_RE.test(text)) return { reject: 'V4_chain' };
  if (AGENCY_RE.test(text)) return { reject: 'V5_agency' };
  const capacity = statedCapacity(text);
  if (capacity !== null && capacity > MAX_CAPACITY) return { reject: 'V6_too_big' };
  const type = venueType(text);
  const score = Math.min(100, scoreVenue({
    nycAddress: true,
    email: BOOKING_LOCAL.test(email.split('@')[0]) ? 'booking' : 'general',
    type,
    liveMusic: LIVE_MUSIC_RE.test(text),
    recent: recent(text, r.publishedDate, now),
  }));
  return {
    lead: {
      // One lead per venue site: the home page is the canonical source.
      kind: 'venue', name: venueName(title, host), source: 'web', source_url: `https://${host}`,
      borough: detectBorough(text) ?? q.borough, genre: Object.entries(GENRES).find(([, g]) => g.match.test(text))?.[0] ?? null,
      venue_type: type, bio_snippet: snippet(r.text ?? ''), email, contact_type: 'email', score,
      status: score >= AUTO_APPROVE_SCORE ? 'approved' : 'new', found_by_query: q.text,
    },
  };
}

export const judge = (r: RawResult, q: Query, now = new Date()): Verdict =>
  q.kind === 'artist' ? judgeArtist(r, q, now) : judgeVenue(r, q, now);
