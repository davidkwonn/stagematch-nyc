// Dry run of the outreach filters on live Exa results: no database, nothing stored or sent.
//   deno run -A --env-file=.env.local scripts/outreach-dryrun.ts artist|venue [queries=4] [offset=0]
// Prints accept/reject counts and accepted leads with emails masked.
import { search } from '../supabase/functions/_shared/outreach/exa.ts';
import { artistQueries, judge, type LeadDraft, slice, venueQueries } from '../supabase/functions/_shared/outreach/rules.ts';

const kind = Deno.args[0] === 'venue' ? 'venue' : 'artist';
const count = Number(Deno.args[1] ?? 4) || 4;
const offset = Number(Deno.args[2] ?? 0) || 0;
const queries = slice(kind === 'artist' ? artistQueries() : venueQueries(), offset, count);

const mask = (e: string | null) => (e ? e.replace(/^(.).*(@.*)$/, '$1***$2') : '—');
const rejected: Record<string, number> = {};
const accepted: LeadDraft[] = [];
let raw = 0;
const started = Date.now();
await Promise.all(queries.map(async q => {
  const results = await search(q);
  raw += results.length;
  for (const r of results) {
    const v = judge(r, q);
    if ('reject' in v) rejected[v.reject] = (rejected[v.reject] ?? 0) + 1;
    else accepted.push(v.lead);
  }
}));
console.log(`${kind}: ${queries.length} queries, ${raw} pages, ${accepted.length} accepted in ${Date.now() - started} ms`);
console.log('rejected:', JSON.stringify(rejected));
for (const l of accepted.sort((a, b) => b.score - a.score)) {
  console.log(`${String(l.score).padStart(3)} ${l.status.padEnd(8)} ${l.contact_type.padEnd(12)} ${(l.venue_type ?? l.genre ?? '').padEnd(16)} ${(l.borough ?? '').padEnd(10)} ${l.name.slice(0, 32).padEnd(32)} ${mask(l.email)}  ${l.source_url}`);
}
