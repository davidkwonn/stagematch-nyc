// outreach-optout (no JWT): the one-click link in every outreach email.
// GET ?token=<lead id> → email added to do_not_contact, lead marked opted_out, plain confirmation page.

import { cors } from '../_shared/cors.ts';
import { db, log } from '../_shared/db.ts';
import { isUuid } from '../_shared/internal.ts';

const page = (title: string, text: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">` +
      `<h1 style="font-size:1.4rem">${title}</h1><p>${text}</p></body></html>`,
    { status, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } },
  );

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const token = new URL(req.url).searchParams.get('token');
  if (!isUuid(token)) return page('Link not valid', 'This unsubscribe link is not valid.', 400);
  try {
    const { data: lead } = await db.from('outreach_leads').select('id, email, kind').eq('id', token).maybeSingle();
    if (!lead) return page('You are unsubscribed', "We won't contact you again.");
    if (lead.email) await db.from('do_not_contact').upsert({ email: lead.email.toLowerCase(), reason: 'opt-out link' }, { onConflict: 'email' });
    await db.from('outreach_leads').update({ status: 'opted_out' }).eq('id', lead.id);
    await log('outreach', 'opted_out', { lead_id: lead.id, kind: lead.kind });
    return page('You are unsubscribed', "Done. Stagehand won't email you again. Sorry for the interruption.");
  } catch (e) {
    console.error(e);
    return page('Something went wrong', 'Please reply to the email with "unsubscribe" and we will remove you by hand.', 500);
  }
});
