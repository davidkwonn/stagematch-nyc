// Which integrations are configured (booleans only).
import { serve, json } from '../_shared/cors.ts';

const has = (k: string) => Boolean(Deno.env.get(k));

serve(async () => json({
  ok: true,
  ai: has('AI_API_KEY') || has('LOVABLE_API_KEY'), voice: has('OPENAI_API_KEY'),
  whop: has('WHOP_API_KEY'), whop_simulate: Deno.env.get('WHOP_SIMULATE') === 'true',
  terac: has('TERAC_API_KEY'), terac_simulate: Deno.env.get('TERAC_SIMULATE') === 'true',
}));
