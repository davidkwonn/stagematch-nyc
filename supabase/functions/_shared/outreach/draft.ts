// One email per lead, in Mack's voice. AI writes the body (≤ 120 words); the signup link,
// sender line and opt-out line are always appended by code, never left to the model.
import { chat } from '../ai.ts';
import { GENRES } from './rules.ts';

export type DraftLead = {
  id: string;
  kind: 'artist' | 'venue';
  name: string;
  source: string;
  borough: string | null;
  genre: string | null;
  venue_type: string | null;
  bio_snippet: string | null;
};
export type Draft = { subject: string; body: string; ai: boolean };

const MAX_WORDS = 120;
const LOVABLE_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const FACTS_ARTIST =
  'Stagehand is an AI booking agent for emerging NYC artists, run by Mack. It books paid gigs at NYC bars. ' +
  "The venue's payment is held before the show and released to the artist after it, minus Stagehand's 15% fee.";
const FACTS_VENUE =
  "Stagehand's AI booking manager, Mack, matches local NYC artists to a venue's free nights, handles the booking chat, " +
  'and holds the payment until the show; the venue is refunded if the artist does not show.';

const SYSTEM =
  'You are Mack, the AI booking manager at Stagehand, writing a first, short, warm cold email. ' +
  'Use only the facts given. Mention exactly one real detail from their page. No invented claims, partnerships, ' +
  'numbers, discounts or urgency. Plain text, no links, no sign-off. ' +
  'Reply as JSON: {"subject": "...", "body": "..."} with a body of at most 100 words.';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const genreLabel = (g: string | null) => (g && GENRES[g]?.label) || null;

export function links(leadId: string) {
  const app = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const fn = `${Deno.env.get('SUPABASE_URL')}/functions/v1/outreach-optout`;
  return { signup: `${app}/?ref=${leadId}`, optout: `${fn}?token=${leadId}` };
}

export function footer(leadId: string): string {
  const { signup, optout } = links(leadId);
  return `\n\nStart here: ${signup}\n\nMack, AI booking manager at Stagehand (NYC)\n` +
    `Not interested? One click and we won't email you again: ${optout}`;
}

// Deterministic fallback, also used when the AI is unavailable.
export function templateDraft(lead: DraftLead): Draft {
  const where = lead.borough && lead.borough !== 'NYC' ? ` in ${lead.borough}` : '';
  if (lead.kind === 'artist') {
    const what = genreLabel(lead.genre);
    return {
      subject: `Paid NYC bar gigs for ${lead.name}`,
      body: `Hi ${lead.name}, I'm Mack, the AI booking manager at Stagehand. I found your ${lead.source === 'soundcloud' ? 'SoundCloud' : 'Bandcamp'} page` +
        `${what ? ` and your ${what} sound` : ''}${where ? ` out of ${lead.borough}` : ''}. ` +
        'Stagehand books emerging NYC artists into paid gigs at bars. I match your free nights with venues, handle the booking chat, ' +
        "and the venue's payment is held before the show and released to you after it, minus our 15% fee. " +
        'If you want paid gigs, sign up in two minutes.',
      ai: false,
    };
  }
  return {
    subject: `Local artists for your free nights at ${lead.name}`,
    body: `Hi ${lead.name} team, I'm Mack, the AI booking manager at Stagehand. I saw you host live music${where}. ` +
      'I match emerging local NYC artists to your free nights, handle the booking chat with them, and hold the payment until the show, ' +
      "refunded if the artist doesn't show. If you have open nights, tell me when and I'll send you a few artists who fit.",
    ai: false,
  };
}

async function complete(messages: { role: 'system' | 'user'; content: string }[]): Promise<string> {
  if (Deno.env.get('AI_API_KEY')) return (await chat(messages)).content ?? '';
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('no AI key');
  const res = await fetch(LOVABLE_GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('OUTREACH_AI_MODEL') ?? 'openai/gpt-6-astra', messages }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ai ${res.status}`);
  return (await res.json()).choices?.[0]?.message?.content ?? '';
}

export async function draftEmail(lead: DraftLead): Promise<Draft> {
  const facts = lead.kind === 'artist' ? FACTS_ARTIST : FACTS_VENUE;
  const about = [
    `Recipient: ${lead.kind === 'artist' ? 'emerging NYC artist' : `NYC ${lead.venue_type ?? 'venue'}`} "${lead.name}"`,
    lead.borough && `Borough: ${lead.borough}`,
    genreLabel(lead.genre) && `Genre: ${genreLabel(lead.genre)}`,
    lead.bio_snippet && `From their page: ${lead.bio_snippet}`,
    `Facts: ${facts}`,
    lead.kind === 'artist' ? 'Goal: invite them to sign up for paid gigs.' : 'Goal: offer artists for their open nights.',
  ].filter(Boolean).join('\n');
  try {
    const raw = await complete([{ role: 'system', content: SYSTEM }, { role: 'user', content: about }]);
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { subject?: string; body?: string };
    const subject = json.subject?.trim();
    const body = json.body?.trim();
    if (!subject || !body || words(body) > MAX_WORDS || /https?:\/\//.test(body)) return templateDraft(lead);
    return { subject: subject.slice(0, 120), body, ai: true };
  } catch {
    return templateDraft(lead);
  }
}
