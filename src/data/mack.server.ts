import { createOpenAI } from '@ai-sdk/openai';
import { streamText, Output, NoObjectGeneratedError, type LanguageModel, type ModelMessage } from 'ai';
import { z } from 'zod';
import { MACK_PROMPT } from './mack-prompt';
import { createLovableAiGatewayRunIdFetch } from './run-id.server';
import { intakeComplete } from './rules';
import type { Party } from './types';
const schema=z.object({reply:z.string(),start_date:z.string().nullable(),set_length_min:z.number().nullable(),pay_usd:z.number().nullable(),capacity:z.number().nullable(),goals:z.string().nullable(),gig_date:z.string().nullable(),start_time:z.string().nullable(),offer_usd:z.number().nullable(),note:z.string().nullable(),availability:z.array(z.object({kind:z.enum(['date','weekly']),date:z.string().nullable(),weekday:z.number().nullable(),start_time:z.string(),end_time:z.string(),note:z.string().nullable()}))});
export async function mackTurn(threadId:string,party:Party,ownerId:string,request:Request){
 const{ supabaseAdmin:db }=await import('@/integrations/supabase/client.server');
 const check=<T>(r:{data:T;error:{message:string}|null})=>{if(r.error)throw new Error(r.error.message);return r.data;};
 const thread=check(await db.from('threads').select('*').eq('id',threadId).single());
 const table=party==='artist'?'artists':'venues';
 const profile=check(await db.from(table).select('*').eq('id',ownerId).single());
 const [msgs,slots,notes,bookings]=await Promise.all([db.from('messages').select('sender_role,content').eq('thread_id',threadId).order('created_at').limit(100),db.from('availability').select('*').eq('owner_type',party).eq('owner_id',ownerId),db.from('mack_notes').select('note').eq('owner_type',party).eq('owner_id',ownerId).limit(30),db.from('bookings').select('gig_date,start_time,set_length_min,offer_usd,status,artist_confirmed,venue_confirmed').eq(party==='artist'?'artist_id':'venue_id',ownerId)]);
 let booking=null;if(thread.booking_id)booking=check(await db.from('bookings').select('*,artists(name),venues(name)').eq('id',thread.booking_id).single());
 const key=process.env['LOVABLE_API_KEY'];if(!key)throw new Error('Mack is not configured');
 const paused=check(await db.from('mack_notes').select('note').eq('owner_type',party).eq('owner_id',ownerId).like('note','AI_ACCESS_PAUSED:%').limit(1));if(paused.length)throw new Error('Mack is paused until AI access is restored');
 const run=createLovableAiGatewayRunIdFetch(request.headers.get('X-Lovable-AIG-Run-ID')??undefined);
 const provider=createOpenAI({baseURL:'https://ai.gateway.lovable.dev/v1',apiKey:key,headers:{'Lovable-API-Key':key,'X-Lovable-AIG-SDK':'vercel-ai-sdk'},fetch:run.fetch});
 const context={party,kind:thread.kind,today:new Date().toISOString().slice(0,10),profile,availability:slots.data,notes:notes.data,booking,otherBookings:bookings.data};
 const history:ModelMessage[]=(msgs.data??[]).map(m=>m.sender_role==='agent'?{role:'assistant',content:m.content}:{role:'user',content:`[${m.sender_role}]: ${m.content}`});
 if(!history.length)history.push({role:'user',content:'Introduce yourself and ask what days and times I am available.'});
 const result=streamText({model:provider.responses('openai/gpt-6-astra') as unknown as LanguageModel,instructions:`${MACK_PROMPT}\nTrusted context: ${JSON.stringify(context)}`,messages:history,output:Output.object({schema}),maxRetries:0,providerOptions:{openai:{forceReasoning:true,reasoningEffort:'low',reasoningSummary:'auto',store:false,include:['reasoning.encrypted_content']}}});
 let out:z.infer<typeof schema>;
 try{out=await result.output;}catch(error){if(NoObjectGeneratedError.isInstance(error)){try{out=schema.parse(JSON.parse(error.text??''));}catch{throw new Error('Mack could not read those details. Your message is saved.');}}else{const e=error as {statusCode?:number;message?:string};if(e.statusCode===402||e.statusCode===403)await db.from('mack_notes').insert({owner_type:party,owner_id:ownerId,thread_id:threadId,note:`AI_ACCESS_PAUSED:${e.statusCode}`});throw new Error(e.statusCode===402?'AI credits are unavailable. Please restore credits.':e.statusCode===403?'AI access is unavailable. Please restore access.':'Mack is temporarily unavailable. Your message is saved.');}}
 const date=(v:string|null)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))?v:null;
 const positive=(v:number|null)=>v!=null&&Number.isFinite(v)&&v>0?Math.round(v):null;
 if(thread.kind==='manager'){
  const patch:Record<string,string|number>={};if(date(out.start_date))patch.start_date=String(out.start_date);if(positive(out.set_length_min))patch.set_length_min=Number(out.set_length_min);if(positive(out.pay_usd))patch[party==='artist'?'rate_usd':'budget_usd']=Number(out.pay_usd);if(party==='venue'&&positive(out.capacity))patch.capacity=Number(out.capacity);if(out.goals?.trim())patch.goals=out.goals.trim();
  for(const s of out.availability){if(!/^\d{2}:\d{2}$/.test(s.start_time)||!/^\d{2}:\d{2}$/.test(s.end_time)||s.end_time<=s.start_time)continue;if(s.kind==='date'&&!date(s.date))continue;if(s.kind==='weekly'&&(s.weekday==null||!Number.isInteger(s.weekday)||s.weekday<0||s.weekday>6))continue;
   let q=db.from('availability').select('id').eq('owner_type',party).eq('owner_id',ownerId).eq('kind',s.kind);q=s.kind==='date'?q.eq('date',String(s.date)):q.eq('weekday',Number(s.weekday));const existing=check(await q.limit(1).maybeSingle());const fields={...s,owner_type:party,owner_id:ownerId,source:'chat' as const};check(existing?await db.from('availability').update(fields).eq('id',existing.id):await db.from('availability').insert(fields));
   check(await db.from('agent_log').insert({agent:'Mack',action:'Availability saved',detail:{kind:s.kind,date:s.date,weekday:s.weekday}}));
  }
  if(Object.keys(patch).length)check(await db.from(table).update(patch).eq('id',ownerId));
  const updated=check(await db.from(table).select('*').eq('id',ownerId).single());const count=check(await db.from('availability').select('id').eq('owner_type',party).eq('owner_id',ownerId));
  if(intakeComplete(updated,party,count.length)&&!updated.intake_completed_at){check(await db.from(table).update({intake_completed_at:new Date().toISOString()}).eq('id',ownerId));check(await db.from('agent_log').insert({agent:'Mack',action:'Intake completed',detail:{party}}));}
 }else if(booking?.status==='negotiating'){
  const patch:Record<string,string|number|boolean>={};if(date(out.gig_date))patch.gig_date=String(out.gig_date);if(out.start_time&&/^\d{2}:\d{2}$/.test(out.start_time))patch.start_time=out.start_time;if(positive(out.set_length_min))patch.set_length_min=Number(out.set_length_min);if(positive(out.offer_usd))patch.offer_usd=Number(out.offer_usd);
  const changed=Object.entries(patch).some(([k,v])=>String(booking?.[k as keyof typeof booking]).slice(0,k==='start_time'?5:1000)!==String(v));if(changed){patch.artist_confirmed=false;patch.venue_confirmed=false;check(await db.from('bookings').update(patch).eq('id',booking.id).eq('status','negotiating'));check(await db.from('agent_log').insert({agent:'Mack',action:'Booking terms updated',detail:patch}));}
 }
 if(out.note?.trim())check(await db.from('mack_notes').insert({owner_type:party,owner_id:ownerId,thread_id:threadId,note:out.note.trim()}));
 if(!out.reply.trim())throw new Error('Mack returned an empty reply');check(await db.from('messages').insert({thread_id:threadId,sender_role:'agent',content:out.reply.trim()}));
}
