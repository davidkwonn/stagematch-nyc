import { createOpenAI } from '@ai-sdk/openai';
import { streamText, Output, NoObjectGeneratedError, type LanguageModel, type ModelMessage } from 'ai';
import { z } from 'zod';
import { MACK_PROMPT } from './mack-prompt';
import { createLovableAiGatewayRunIdFetch } from './run-id.server';
import { intakeComplete } from './rules';
import { logDecision } from './live';
import type { Party, Database } from './types';
const schema=z.object({reply:z.string(),start_date:z.string().nullable(),set_length_min:z.number().nullable(),pay_usd:z.number().nullable(),capacity:z.number().nullable(),goals:z.string().nullable(),gig_date:z.string().nullable(),start_time:z.string().nullable(),offer_usd:z.number().nullable(),note:z.string().nullable(),availability:z.array(z.object({kind:z.enum(['date','weekly']),date:z.string().nullable(),weekday:z.number().nullable(),start_time:z.string(),end_time:z.string(),note:z.string().nullable()}))});
type Row<T extends keyof Database['public']['Tables']>=Database['public']['Tables'][T]['Row'];
export type MackResult={reply:string;saved:string[];missing:string[];intakeCompleted:boolean;matches:string[]};
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
// Mack lives in New York: "today" and "this Friday" are NYC dates, not UTC.
export const nycToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
export const dayLabel=(d:string)=>new Date(`${d}T12:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
export const timeLabel=(t:string)=>{const h=Number(t.slice(0,2)),m=t.slice(3,5);return `${h%12||12}${m==='00'?'':`:${m}`} ${h<12?'am':'pm'}`;};
export const slotLabel=(s:{kind:string;date:string|null;weekday:number|null;start_time:string;end_time:string})=>`${s.kind==='date'&&s.date?dayLabel(s.date):`every ${WEEKDAYS[s.weekday??0]}`} ${timeLabel(s.start_time)}–${timeLabel(s.end_time)}`;
export function missingIntake(p:{start_date:string|null;set_length_min:number|null;goals:string|null;rate_usd?:number|null;budget_usd?:number|null;capacity?:number|null},party:Party,slotCount:number){
 return [!slotCount&&'availability',!p.start_date&&'start date',!(p.set_length_min??0)&&'set length',party==='artist'?!(p.rate_usd??0)&&'rate':!(p.budget_usd??0)&&'budget',party==='venue'&&!(p.capacity??0)&&'capacity',!p.goals?.trim()&&(party==='venue'?'music they want':'goals')].filter(Boolean) as string[];
}
// One context for chat and voice: the thread's party profile (no contact details), calendar, notes, bookings and the conversation.
export async function mackContext(threadId:string,party:Party,ownerId:string){
 const{ supabaseAdmin:db }=await import('@/integrations/supabase/client.server');
 const required=<T>(r:{data:T;error:{message:string}|null}):NonNullable<T>=>{if(r.error)throw new Error(r.error.message);if(r.data==null)throw new Error("Record not found");return r.data;};
 const thread=required(await db.from('threads').select('*').eq('id',threadId).single());
 const table=party==='artist'?'artists':'venues';
 const profile=required(await db.from(table).select('*').eq('id',ownerId).single()) as Row<'artists'>&Row<'venues'>;
 const [msgs,slots,notes,bookings]=await Promise.all([db.from('messages').select('sender_role,channel,content').eq('thread_id',threadId).order('created_at',{ascending:false}).limit(100),db.from('availability').select('*').eq('owner_type',party).eq('owner_id',ownerId),db.from('mack_notes').select('note').eq('owner_type',party).eq('owner_id',ownerId).limit(30),db.from('bookings').select('gig_date,start_time,set_length_min,offer_usd,status,artist_confirmed,venue_confirmed').eq(party==='artist'?'artist_id':'venue_id',ownerId)]);
 let booking=null;if(thread.booking_id)booking=required(await db.from('bookings').select('*,artists(name),venues(name)').eq('id',thread.booking_id).single());
 const {email,phone,user_id,birthday,...publicProfile}=profile;
 const today=nycToday();
 const context={party,kind:thread.kind,today,weekday:WEEKDAYS[new Date(`${today}T12:00:00`).getDay()],timezone:'America/New_York',profile:publicProfile,availability:slots.data,missing:thread.kind==='manager'?missingIntake(profile,party,slots.data?.length??0):[],notes:notes.data,booking,otherBookings:bookings.data};
 return{db,thread,profile,messages:(msgs.data??[]).reverse(),context,required};
}
export async function mackTurn(threadId:string,party:Party,ownerId:string,request:Request,{post=true,source='chat'}:{post?:boolean;source?:'chat'|'voice'}={}):Promise<MackResult>{
 const{db,thread,profile,messages,context,required}=await mackContext(threadId,party,ownerId);
 const check=<T>(r:{data:T;error:{message:string}|null})=>{if(r.error)throw new Error(r.error.message);return r.data;};
 const table=party==='artist'?'artists':'venues';
 const booking=context.booking;
 const key=process.env['LOVABLE_API_KEY'];if(!key)throw new Error('Mack is not configured');
 const paused=required(await db.from('mack_notes').select('note').eq('owner_type',party).eq('owner_id',ownerId).like('note','AI_ACCESS_PAUSED:%').limit(1));if(paused.length)throw new Error('Mack is paused until AI access is restored');
 const run=createLovableAiGatewayRunIdFetch(request.headers.get('X-Lovable-AIG-Run-ID')??undefined);
 const provider=createOpenAI({baseURL:'https://ai.gateway.lovable.dev/v1',apiKey:key,headers:{'Lovable-API-Key':key,'X-Lovable-AIG-SDK':'vercel-ai-sdk'},fetch:run.fetch});
 const history:ModelMessage[]=messages.map(m=>m.sender_role==='agent'?{role:'assistant',content:m.content}:{role:'user',content:`[${m.sender_role}${m.channel==='voice'?', by voice':''}]: ${m.content}`});
 if(!history.length)history.push({role:'user',content:'Introduce yourself and ask what days and times I am available.'});
 const result=streamText({model:provider.responses('openai/gpt-6-astra') as unknown as LanguageModel,instructions:`${MACK_PROMPT}\nTrusted context: ${JSON.stringify(context)}`,messages:history,output:Output.object({schema}),maxRetries:0,providerOptions:{openai:{forceReasoning:true,reasoningEffort:'low',reasoningSummary:'auto',store:false,include:['reasoning.encrypted_content']}}});
 let out:z.infer<typeof schema>;
 try{out=await result.output;}catch(error){if(NoObjectGeneratedError.isInstance(error)){try{out=schema.parse(JSON.parse(error.text??''));}catch{throw new Error('Mack could not read those details. Your message is saved.');}}else{const e=error as {statusCode?:number;message?:string};if(e.statusCode===402||e.statusCode===403)await db.from('mack_notes').insert({owner_type:party,owner_id:ownerId,thread_id:threadId,note:`AI_ACCESS_PAUSED:${e.statusCode}`});throw new Error(e.statusCode===402?'AI credits are unavailable. Please restore credits.':e.statusCode===403?'AI access is unavailable. Please restore access.':'Mack is temporarily unavailable. Your message is saved.');}}
 const date=(v:string|null)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))?v:null;
 const positive=(v:number|null)=>v!=null&&Number.isFinite(v)&&v>0?Math.round(v):null;
 const saved:string[]=[];let missing:string[]=[];let intakeCompleted=false;let matches:string[]=[];
 if(thread.kind==='manager'){
  const patch:Database['public']['Tables']['artists']['Update'] & Database['public']['Tables']['venues']['Update']={};if(date(out.start_date))patch.start_date=String(out.start_date);if(positive(out.set_length_min))patch.set_length_min=Number(out.set_length_min);if(positive(out.pay_usd))patch[party==='artist'?'rate_usd':'budget_usd']=Number(out.pay_usd);if(party==='venue'&&positive(out.capacity))patch.capacity=Number(out.capacity);if(out.goals?.trim())patch.goals=out.goals.trim();
  for(const s of out.availability){if(!/^\d{2}:\d{2}$/.test(s.start_time)||!/^\d{2}:\d{2}$/.test(s.end_time)||s.end_time<=s.start_time)continue;if(s.kind==='date'&&!date(s.date))continue;if(s.kind==='weekly'&&(s.weekday==null||!Number.isInteger(s.weekday)||s.weekday<0||s.weekday>6))continue;
   let q=db.from('availability').select('id').eq('owner_type',party).eq('owner_id',ownerId).eq('kind',s.kind);q=s.kind==='date'?q.eq('date',String(s.date)):q.eq('weekday',Number(s.weekday));const existing=check(await q.limit(1).maybeSingle());const fields={...s,owner_type:party,owner_id:ownerId,source};check(existing?await db.from('availability').update(fields).eq('id',existing.id):await db.from('availability').insert(fields));
   saved.push(slotLabel(s));await logDecision('Mack','Availability saved',{kind:s.kind,date:s.date,weekday:s.weekday,source},db);
  }
  if(Object.keys(patch).length){if(party==='artist'){const {budget_usd,capacity,contact_name,venue_type,address,...artistPatch}=patch;check(await db.from('artists').update(artistPatch).eq('id',ownerId));}else{const {birthday,background,rate_usd,video_path,vetting,vetting_note,...venuePatch}=patch;check(await db.from('venues').update(venuePatch).eq('id',ownerId));}
   if(patch.start_date)saved.push(`start date ${dayLabel(patch.start_date)}`);if(patch.set_length_min)saved.push(`${patch.set_length_min}-minute sets`);if(patch.rate_usd)saved.push(`rate $${patch.rate_usd}`);if(patch.budget_usd)saved.push(`budget $${patch.budget_usd}`);if(patch.capacity)saved.push(`capacity ${patch.capacity}`);if(patch.goals)saved.push('goals');
   await logDecision('Mack','Profile updated',{fields:Object.keys(patch),source},db);}
  const updated=required(await db.from(table).select('*').eq('id',ownerId).single());const count=required(await db.from('availability').select('id').eq('owner_type',party).eq('owner_id',ownerId));
  missing=missingIntake(updated,party,count.length);
  if(intakeComplete(updated,party,count.length)&&!updated.intake_completed_at){check(await db.from(table).update({intake_completed_at:new Date().toISOString()}).eq('id',ownerId));await logDecision('Mack','Intake completed',{party,source},db);intakeCompleted=true;
   if(party==='venue')matches=await presentMatches(threadId,ownerId).catch(async e=>{await logDecision('Mack','Matching unavailable',{error:e instanceof Error?e.message:String(e)},db);return [];});
   else await submitForVetting(ownerId).catch(async e=>{await logDecision('Mack','Vetting request unavailable',{error:e instanceof Error?e.message:String(e)},db);});
  }
 }else if(booking?.status==='negotiating'){
  const patch:Database['public']['Tables']['bookings']['Update']={};if(date(out.gig_date))patch.gig_date=String(out.gig_date);if(out.start_time&&/^\d{2}:\d{2}$/.test(out.start_time))patch.start_time=out.start_time;if(positive(out.set_length_min))patch.set_length_min=Number(out.set_length_min);if(positive(out.offer_usd))patch.offer_usd=Number(out.offer_usd);
  const changed=Object.entries(patch).some(([k,v])=>String(booking?.[k as keyof typeof booking]).slice(0,k==='start_time'?5:1000)!==String(v));if(changed){patch.artist_confirmed=false;patch.venue_confirmed=false;check(await db.from('bookings').update(patch).eq('id',booking.id).eq('status','negotiating'));await logDecision('Mack','Booking terms updated',{...patch,source},db);saved.push('booking terms (both sides need to press Confirm again)');}
 }
 if(out.note?.trim())check(await db.from('mack_notes').insert({owner_type:party,owner_id:ownerId,thread_id:threadId,note:out.note.trim()}));
 const reply=out.reply.trim();
 if(post){if(!reply)throw new Error('Mack returned an empty reply');check(await db.from('messages').insert({thread_id:threadId,sender_role:'agent',content:reply}));}
 return{reply,saved,missing,intakeCompleted,matches};
}
// Venue intake done: rank artists now and post the top 3 in the venue's manager thread.
async function presentMatches(threadId:string,venueId:string){
 const{ supabaseAdmin:db }=await import('@/integrations/supabase/client.server');
 const {matchVenue}=await import('./backend.server');
 const top=(await matchVenue(venueId)).slice(0,3);
 if(!top.length){await db.from('messages').insert({thread_id:threadId,sender_role:'agent',content:"Your calendar is ready. No artist lines up with your nights yet; I'll ping you as soon as one does."});return [];}
 const lines=top.map((s,i)=>`${i+1}. ${s.artists?.name??'Artist'}${s.slot_date?`, free ${dayLabel(s.slot_date)}${s.slot_start?` at ${timeLabel(s.slot_start)}`:''}`:''}. ${s.reason}`);
 await db.from('messages').insert({thread_id:threadId,sender_role:'agent',content:`Your calendar is ready. Here are your top ${top.length} artists for those nights:\n${lines.join('\n')}\nSay yes or no to each on your Home tab.`});
 await logDecision('Mack','Top artists presented',{count:top.length},db);
 // Spoken by the voice at the end of the call: who, why, when, and whether expert bookers verified them.
 return top.map(s=>`${s.artists?.name??'Artist'} (${s.reason}${s.slot_date?` Free ${dayLabel(s.slot_date)}${s.slot_start?` at ${timeLabel(s.slot_start)}`:''}.`:''}${s.artists?.vetting==='verified'?' Verified by expert bookers.':''})`);
}
// Artist intake done: send the profile to expert bookers (Terac) through the vetting Edge Function, if deployed.
async function submitForVetting(artistId:string){
 const url=process.env['SUPABASE_URL'],key=process.env['SUPABASE_SERVICE_ROLE_KEY'];if(!url||!key)return;
 const res=await fetch(`${url}/functions/v1/terac-submit`,{method:'POST',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},body:JSON.stringify({artist_id:artistId}),signal:AbortSignal.timeout(8000)});
 if(!res.ok)throw new Error(`terac-submit ${res.status}`);
}
