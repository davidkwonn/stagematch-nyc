import { HttpError } from './cors.ts';

// True when the request carries the service role key, i.e. another function
// called us through `invoke()` (Mack → match, Mack → terac-submit).
export function isServiceCall(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return Boolean(token && key && token === key);
}

// Cron-only endpoints: `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`.
export function assertCron(req: Request) {
  const secret = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret') ?? req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!secret) throw new HttpError(500, 'CRON_SECRET is not set');
  if (given !== secret && !isServiceCall(req)) throw new HttpError(401, 'cron secret required');
}

// Parse a JSON body, 400 on garbage.
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    throw new HttpError(400, 'body must be JSON');
  }
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
