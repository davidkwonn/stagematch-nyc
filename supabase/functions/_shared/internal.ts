import { createClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './cors.ts';

const bearer = (req: Request) => req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';

// Role claimed by a JWT, without verifying it (verification happens below or in getCaller).
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role ?? null;
  } catch {
    return null;
  }
}

const verifiedServiceKeys = new Set<string>();

// True when the request carries a service key: another function or Mack's server code
// called us (Mack → terac-submit). Accepts the legacy service_role JWT and the newer
// sb_secret_ keys. A candidate that isn't our own env value is proven once with an admin
// call only a service key can make, then cached. User tokens are never probed.
export async function isServiceCall(req: Request): Promise<boolean> {
  const token = bearer(req);
  if (!token) return false;
  const own = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_SECRET_KEY')];
  if (own.includes(token) || verifiedServiceKeys.has(token)) return true;
  if (!token.startsWith('sb_secret_') && jwtRole(token) !== 'service_role') return false;
  const probe = createClient(Deno.env.get('SUPABASE_URL')!, token, { auth: { persistSession: false } });
  const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) return false;
  verifiedServiceKeys.add(token);
  return true;
}

// Cron-only endpoints: `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`.
export async function assertCron(req: Request) {
  const secret = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret') ?? bearer(req);
  if (!secret) throw new HttpError(500, 'CRON_SECRET is not set');
  if (given !== secret && !(await isServiceCall(req))) throw new HttpError(401, 'cron secret required');
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
