// outreach-run { kind: 'artist' | 'venue', limit?, draft? } → run stats
// Mack searches the public web (Exa), filters and scores in code, stores leads, then drafts one
// email per approved lead and "sends" it in simulation. Auth: x-cron-secret, a service key, or an admin.

import { HttpError, json, serve } from '../_shared/cors.ts';
import { db, log } from '../_shared/db.ts';
import { isServiceCall } from '../_shared/internal.ts';
import { draftEmail, footer, type DraftLead } from '../_shared/outreach/draft.ts';
import { search } from '../_shared/outreach/exa.ts';
import { artistQueries, type Kind, type LeadDraft, judge, type Query, slice, venueQueries } from '../_shared/outreach/rules.ts';

const QUERIES_PER_RUN = 10;
const PARALLEL = 5;
const MAX_DRAFTS = 20;
const TIME_BUDGET_MS = 50_000;

type RunInput = { kind?: string; limit?: number; draft?: boolean };

async function authorize(req: Request): Promise<string> {
  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('x-cron-secret') === cron) return 'cron';
  if (await isServiceCall(req)) return 'service';
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) throw new HttpError(401, 'sign in required');
  const { data } = await db.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  const admins = (Deno.env.get('ADMIN_EMAILS') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!email || !admins.includes(email)) throw new HttpError(403, 'admins only');
  return `admin:${email}`;
}

const simulated = () => Deno.env.get('OUTREACH_SIMULATE') !== 'false';
const bump = (counts: Record<string, number>, key: string, by = 1) => { counts[key] = (counts[key] ?? 0) + by; };

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

// F8: drop leads already stored (same page or same email) and anyone on do_not_contact.
async function freshOnly(leads: LeadDraft[], rejected: Record<string, number>): Promise<LeadDraft[]> {
  const unique = [...new Map(leads.map(l => [l.source_url, l])).values()];
  bump(rejected, 'F8_duplicate', leads.length - unique.length);
  if (!unique.length) return [];
  const emails = [...new Set(unique.map(l => l.email).filter((e): e is string => Boolean(e)))];
  const [known, knownEmails, blocked] = await Promise.all([
    db.from('outreach_leads').select('source_url').in('source_url', unique.map(l => l.source_url)),
    emails.length ? db.from('outreach_leads').select('email').in('email', emails) : Promise.resolve({ data: [] }),
    emails.length ? db.from('do_not_contact').select('email').in('email', emails) : Promise.resolve({ data: [] }),
  ]);
  const seenUrl = new Set((known.data ?? []).map((r: { source_url: string }) => r.source_url));
  const seenEmail = new Set((knownEmails.data ?? []).map((r: { email: string }) => r.email.toLowerCase()));
  const dnc = new Set((blocked.data ?? []).map((r: { email: string }) => r.email.toLowerCase()));
  const out: LeadDraft[] = [];
  for (const l of unique) {
    const e = l.email?.toLowerCase();
    if (seenUrl.has(l.source_url) || (e && seenEmail.has(e))) { bump(rejected, 'F8_duplicate'); continue; }
    if (e && dnc.has(e)) { bump(rejected, 'F8_do_not_contact'); continue; }
    if (e) seenEmail.add(e);
    out.push(l);
  }
  return out;
}

// One message per approved lead with a public email, max MAX_DRAFTS, never past the time budget.
async function draftAndSend(kind: Kind, started: number): Promise<number> {
  const { data: leads } = await db.from('outreach_leads')
    .select('id, kind, name, source, borough, genre, venue_type, bio_snippet, email, outreach_messages(id)')
    .eq('kind', kind).eq('status', 'approved').eq('contact_type', 'email').not('email', 'is', null)
    .order('score', { ascending: false }).limit(MAX_DRAFTS * 2);
  const todo = (leads ?? []).filter(l => !l.outreach_messages?.length).slice(0, MAX_DRAFTS);
  let done = 0;
  await inBatches(todo, PARALLEL, async lead => {
    if (Date.now() - started > TIME_BUDGET_MS) return;
    const { data: blocked } = await db.from('do_not_contact').select('email').eq('email', String(lead.email).toLowerCase()).maybeSingle();
    if (blocked) {
      await db.from('outreach_leads').update({ status: 'opted_out' }).eq('id', lead.id);
      return;
    }
    const d = await draftEmail(lead as DraftLead);
    const now = new Date().toISOString();
    const status = simulated() ? 'simulated' : 'draft'; // real sending is out of scope today
    const { error } = await db.from('outreach_messages').insert({
      lead_id: lead.id, subject: d.subject, body: d.body + footer(lead.id), status, sent_at: status === 'simulated' ? now : null,
    });
    if (error) return;
    if (status === 'simulated') {
      await db.from('outreach_leads').update({ status: 'contacted', contacted_at: now }).eq('id', lead.id);
      await log('outreach', 'email_simulated', { lead_id: lead.id, kind, name: lead.name, ai: d.ai });
    }
    done++;
  });
  return done;
}

serve(async req => {
  const started = Date.now();
  const by = await authorize(req);
  let input: RunInput = {};
  try {
    input = await req.json();
  } catch {
    // empty body: defaults
  }
  const kind: Kind = input.kind === 'venue' ? 'venue' : 'artist';
  const size = Math.max(1, Math.min(QUERIES_PER_RUN, Number(input.limit) || QUERIES_PER_RUN));

  const { count } = await db.from('outreach_runs').select('id', { count: 'exact', head: true }).eq('kind', kind);
  const queries: Query[] = slice(kind === 'artist' ? artistQueries() : venueQueries(), count ?? 0, size);
  const { data: run } = await db.from('outreach_runs').insert({ kind, queries: queries.map(q => q.text) }).select('id').single();

  const rejected: Record<string, number> = {};
  let rawResults = 0;
  try {
    const results = await inBatches(queries, PARALLEL, async q => {
      try {
        return { q, results: await search(q) };
      } catch (e) {
        bump(rejected, 'search_error');
        console.error(e);
        return { q, results: [] };
      }
    });
    const candidates: LeadDraft[] = [];
    for (const { q, results: rs } of results) {
      rawResults += rs.length;
      for (const r of rs) {
        const v = judge(r, q);
        if ('reject' in v) bump(rejected, v.reject);
        else candidates.push(v.lead);
      }
    }
    const fresh = await freshOnly(candidates, rejected);
    if (fresh.length) {
      const { error } = await db.from('outreach_leads').upsert(fresh, { onConflict: 'source_url', ignoreDuplicates: true });
      if (error) for (const l of fresh) await db.from('outreach_leads').insert(l); // race on the email index: one by one
    }
    const drafted = input.draft === false ? 0 : await draftAndSend(kind, started);
    const stats = {
      kind, by, queries: queries.length, raw_results: rawResults, accepted: fresh.length,
      contact_form: fresh.filter(l => l.contact_type === 'contact_form').length,
      approved: fresh.filter(l => l.status === 'approved').length, rejected, drafted,
      simulated: simulated(), ms: Date.now() - started,
    };
    await db.from('outreach_runs').update({
      finished_at: new Date().toISOString(), raw_results: rawResults, accepted: stats.accepted,
      contact_form: stats.contact_form, rejected, drafted,
    }).eq('id', run?.id);
    await log('outreach', 'run_finished', stats);
    return json(stats);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('outreach_runs').update({ finished_at: new Date().toISOString(), raw_results: rawResults, rejected, error: message }).eq('id', run?.id);
    await log('outreach', 'run_failed', { kind, error: message });
    throw e;
  }
});
