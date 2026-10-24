// deno test --config supabase/functions/deno.json supabase/functions/_shared/outreach/rules_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { artistQueries, bookingEmail, detectBorough, extractEmails, judge, normalizeUrl, slice, venueQueries, venueType } from './rules.ts';

const NOW = new Date('2026-10-24T12:00:00Z');
const artistQ = artistQueries()[0];
const venueQ = venueQueries()[0];

Deno.test('matrices cover every borough and put bars first', () => {
  assertEquals(new Set(artistQueries().map(q => q.borough)).size, 5);
  assert(venueQueries().slice(0, 20).every(q => /\bbar\b/.test(q.text)));
  assertEquals(slice([1, 2, 3, 4, 5], 1, 3), [4, 5, 1]);
});

Deno.test('normalizes artist pages and refuses platform pages', () => {
  assertEquals(normalizeUrl('https://cherylrichards.bandcamp.com/album/x?y=1'), { url: 'https://cherylrichards.bandcamp.com/', source: 'bandcamp' });
  assertEquals(normalizeUrl('https://soundcloud.com/Nia-Beats/track-1'), { url: 'https://soundcloud.com/nia-beats', source: 'soundcloud' });
  assertEquals(normalizeUrl('https://soundcloud.com/discover'), null);
  assertEquals(normalizeUrl('https://bandcamp.com/tag/jazz'), null);
});

Deno.test('extracts real emails and prefers booking addresses', () => {
  assertEquals(extractEmails('logo@2x.png write booking@pianos.nyc or noreply@x.com.'), ['booking@pianos.nyc']);
  assertEquals(bookingEmail('owner@bar.com, info@bar.com, events@bar.com'), 'events@bar.com');
  assertEquals(bookingEmail('nothing here'), null);
});

Deno.test('detects boroughs from neighbourhoods', () => {
  assertEquals(detectBorough('Based in Bushwick'), 'Brooklyn');
  assertEquals(detectBorough('Astoria, NY 11102'), 'Queens');
  assertEquals(detectBorough('Somewhere in NYC'), 'NYC');
});

Deno.test('accepts an emerging NYC artist with a booking email and auto-approves', () => {
  const v = judge({
    url: 'https://melaniecharles.bandcamp.com/album/y',
    title: 'Music | Melanie Charles',
    text: 'Brooklyn jazz and soul singer. New EP out 2026. Booking: booking@melaniecharles.com. ' + 'x'.repeat(200),
  }, { ...artistQ, genre: 'jazz_soul_rnb' }, NOW);
  assert('lead' in v);
  assertEquals(v.lead.name, 'Melanie Charles');
  assertEquals(v.lead.contact_type, 'email');
  assertEquals(v.lead.borough, 'Brooklyn');
  assertEquals(v.lead.status, 'approved');
});

Deno.test('keeps an artist without email as contact_form, never approved', () => {
  const v = judge({ url: 'https://x.bandcamp.com/', title: 'Music | X', text: 'Queens indie rock band, live 2026' }, artistQ, NOW);
  assert('lead' in v);
  assertEquals(v.lead.contact_type, 'contact_form');
  assertEquals(v.lead.status, 'new');
});

Deno.test('rejects artists that fail F1–F6', () => {
  const r = (url: string, title: string, text: string) => judge({ url, title, text }, artistQ, NOW);
  assertEquals(r('https://gigsalad.com/x', 'X', 'Brooklyn jazz 2026'), { reject: 'F1_source' });
  assertEquals(r('https://x.bandcamp.com/', 'Music | X', 'Paris jazz 2026'), { reject: 'F2_not_nyc' });
  assertEquals(r('https://x.bandcamp.com/', 'Music | Night Owl Records', 'Brooklyn jazz 2026'), { reject: 'F3_not_artist' });
  assertEquals(r('https://x.bandcamp.com/', 'Music | X', 'Brooklyn jazz, signed to Atlantic Records 2026'), { reject: 'F4_major_label' });
  assertEquals(r('https://x.bandcamp.com/', 'Music | X', 'Brooklyn jazz from 2014'), { reject: 'F5_inactive' });
  assertEquals(r('https://x.bandcamp.com/', 'Music | X', 'Brooklyn polka 2026'), { reject: 'F6_genre' });
});

Deno.test('scores a neighbourhood bar above a music venue', () => {
  const base = 'Live music every Friday. 123 Wilson Ave, Brooklyn, NY 11237. Booking: booking@place.com. Shows in 2026.';
  const bar = judge({ url: 'https://thebar.com/music', title: 'The Wilson Bar - Bushwick', text: `Cocktail bar. ${base}` }, venueQ, NOW);
  const hall = judge({ url: 'https://thehall.com/', title: 'The Hall', text: `Music venue. ${base}` }, venueQ, NOW);
  assert('lead' in bar && 'lead' in hall);
  assertEquals(bar.lead.venue_type, 'bar');
  assert(bar.lead.score > hall.lead.score);
  assertEquals(bar.lead.status, 'approved');
});

Deno.test('rejects directories, missing address or email, chains, agencies and big rooms', () => {
  const ok = 'Bar with live music. Brooklyn, NY 11211. booking@x.com';
  const v = (url: string, title: string, text: string) => judge({ url, title, text }, venueQ, NOW);
  assertEquals(v('https://www.yelp.com/biz/x', 'X', ok), { reject: 'V1_directory' });
  assertEquals(v('https://thebar.nyc/', 'Best 10 bars in Bushwick', ok), { reject: 'V1_directory' });
  assertEquals(v('https://thebar.nyc/', 'X', 'Bar with live music. booking@x.com'), { reject: 'V2_no_nyc_address' });
  assertEquals(v('https://thebar.nyc/', 'X', 'Bar with live music. Brooklyn, NY 11211.'), { reject: 'V3_no_booking_email' });
  assertEquals(v('https://thebar.nyc/', 'Hard Rock Cafe', ok), { reject: 'V4_chain' });
  assertEquals(v('https://thebar.nyc/', 'X', `${ok}. A booking agency for weddings.`), { reject: 'V5_agency' });
  assertEquals(v('https://thebar.nyc/', 'X', `${ok}. Capacity: 650`), { reject: 'V6_too_big' });
});

Deno.test('classifies venue types', () => {
  assertEquals(venueType('A cozy wine bar'), 'bar');
  assertEquals(venueType('Family restaurant'), 'restaurant_cafe');
  assertEquals(venueType('Historic concert hall'), 'music_venue');
});
