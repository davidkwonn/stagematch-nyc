// deno test -A --config supabase/functions/deno.json supabase/functions/_shared/outreach/draft_test.ts
import { assert, assertStringIncludes } from 'jsr:@std/assert@1';
import { draftEmail, footer, templateDraft, type DraftLead } from './draft.ts';

Deno.env.set('APP_URL', 'https://gigmatch-nyc-stage.lovable.app/');
Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
Deno.env.delete('AI_API_KEY');
Deno.env.delete('LOVABLE_API_KEY');

const artist: DraftLead = { id: '11111111-1111-1111-1111-111111111111', kind: 'artist', name: 'Wetsuit', source: 'bandcamp', borough: 'Brooklyn', genre: 'indie_rock', venue_type: null, bio_snippet: 'Brooklyn indie band' };
const venue: DraftLead = { ...artist, id: '22222222-2222-2222-2222-222222222222', kind: 'venue', name: 'The Trash Bar', source: 'web', venue_type: 'bar' };
const words = (s: string) => s.trim().split(/\s+/).length;

Deno.test('templates stay short, honest and on product facts', () => {
  for (const lead of [artist, venue]) {
    const d = templateDraft(lead);
    assert(words(d.body) <= 120, `${lead.kind} body is ${words(d.body)} words`);
    assert(!/partner|guarantee|discount|%\s*off/i.test(d.body));
  }
  assertStringIncludes(templateDraft(artist).body, '15%');
  assertStringIncludes(templateDraft(venue).body, "refunded if the artist doesn't show");
});

Deno.test('every email carries the signup link, sender and one-click opt-out', () => {
  const f = footer(artist.id);
  assertStringIncludes(f, `https://gigmatch-nyc-stage.lovable.app/?ref=${artist.id}`);
  assertStringIncludes(f, `https://example.supabase.co/functions/v1/outreach-optout?token=${artist.id}`);
  assertStringIncludes(f, 'Mack, AI booking manager at Stagehand');
});

Deno.test('falls back to the template when no AI is configured', async () => {
  const d = await draftEmail(artist);
  assert(!d.ai);
  assertStringIncludes(d.subject, 'Wetsuit');
});
