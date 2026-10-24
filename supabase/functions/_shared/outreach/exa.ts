// Exa search with page text (https://docs.exa.ai). REST call: one request per query.
import type { Query, RawResult } from './rules.ts';

const EXA_URL = 'https://api.exa.ai/search';
const RESULTS_PER_QUERY = 8;
// Artist pages list contacts lower down (bio, "booking:"), so read more of them.
const TEXT_CHARS = { artist: 6000, venue: 3000 } as const;
const TIMEOUT_MS = 15_000;

export async function search(q: Query): Promise<RawResult[]> {
  const key = Deno.env.get('EXA_API_KEY');
  if (!key) throw new Error('EXA_API_KEY is not set');
  const res = await fetch(EXA_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: q.text,
      type: 'auto',
      numResults: RESULTS_PER_QUERY,
      ...(q.includeDomains && { includeDomains: q.includeDomains }),
      contents: { text: { maxCharacters: TEXT_CHARS[q.kind] } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`exa ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json() as { results?: RawResult[] };
  return body.results ?? [];
}
