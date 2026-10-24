import { createClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './cors.ts';

export const FEE_RATE = 0.15;

// Service-role client: functions are the only writers of agent replies,
// suggestions, bookings, payments and vetting.
export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

export type Caller = {
  userId: string;
  artist: { id: string; name: string } | null;
  venue: { id: string; name: string } | null;
};

// Who is calling, from the user's JWT. Throws 401 when signed out.
export async function getCaller(req: Request): Promise<Caller> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  const { data, error } = token ? await db.auth.getUser(token) : { data: { user: null }, error: null };
  if (error || !data.user) throw new HttpError(401, 'sign in required');
  const userId = data.user.id;
  const [{ data: artist }, { data: venue }] = await Promise.all([
    db.from('artists').select('id, name').eq('user_id', userId).maybeSingle(),
    db.from('venues').select('id, name').eq('user_id', userId).maybeSingle(),
  ]);
  return { userId, artist, venue };
}

// Throws 403 unless the caller is a party of the thread (manager owner, or booking artist/venue).
export async function assertThreadParty(caller: Caller, threadId: string) {
  const { data: t } = await db.from('threads').select('*, booking:bookings(artist_id, venue_id)').eq('id', threadId).single();
  if (!t) throw new HttpError(404, 'thread not found');
  const artistId = t.artist_id ?? t.booking?.artist_id;
  const venueId = t.venue_id ?? t.booking?.venue_id;
  const role = caller.artist && caller.artist.id === artistId ? 'artist' : caller.venue && caller.venue.id === venueId ? 'venue' : null;
  if (!role) throw new HttpError(403, 'not part of this thread');
  return { thread: t, role: role as 'artist' | 'venue' };
}

// Every agent decision: shown live on /live.
export async function log(agent: string, action: string, detail: Record<string, unknown> = {}) {
  await db.from('agent_log').insert({ agent, action, detail });
}

// Mack speaking in a thread.
export async function postAgentMessage(threadId: string, content: string, channel: 'text' | 'voice' = 'text') {
  const { data, error } = await db.from('messages')
    .insert({ thread_id: threadId, sender_role: 'agent', channel, content }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

// Call another function with the service role (e.g. Mack → match).
export async function invoke<T = unknown>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} ${res.status}: ${await res.text()}`);
  return await res.json();
}
