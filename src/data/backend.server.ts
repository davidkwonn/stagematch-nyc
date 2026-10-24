import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BookingStatus, Suggestion, Party, ReviewInput } from './types';
import type { ActionInput, ActionResult, PublicResult } from './backend.functions';
import { paymentAmounts, canReportGig } from './rules';
import { logDecision } from './live';
async function admin(){const{ supabaseAdmin }=await import('@/integrations/supabase/client.server');return supabaseAdmin;}
function requireId(value:string|undefined){if(!value||! /^[a-f0-9-]{36}$/i.test(value))throw new Error('Invalid record');return value;}
function checked<T>(r:{data:T;error:{message:string}|null}){if(r.error)throw new Error(r.error.message);return r.data;}
async function log(agent:string,action:string,detail:Record<string,string|number>={}) {const db=await admin();await logDecision(agent,action,detail,db);}
function required<T>(r:{data:T;error:{message:string}|null}):NonNullable<T>{if(r.error)throw new Error(r.error.message);if(r.data==null)throw new Error('Record not found');return r.data;}
export async function handleAction(data:ActionInput,user:SupabaseClient<Database>,userId:string,request:Request):Promise<ActionResult>{
 if(data.action==='start'){
  if(data.party!=='artist'&&data.party!=='venue')throw new Error('Choose artist or venue');
  const profile=required(await user.from(data.party==='artist'?'artists':'venues').select('*').eq('user_id',userId).single());if(!profile)throw new Error('Create your profile first');
  const db=await admin();const key=data.party==='artist'?'artist_id':'venue_id';
  let thread=checked(await db.from('threads').select('*').eq('kind','manager').eq(key,profile.id).maybeSingle());
  if(!thread){const inserted=await db.from('threads').insert({kind:'manager',...(data.party==='artist'?{artist_id:profile.id}:{venue_id:profile.id})}).select('*').single();if(inserted.error?.code==='23505')thread=required(await db.from('threads').select('*').eq('kind','manager').eq(key,profile.id).single());else thread=required(inserted);}
  if(!thread)throw new Error('Could not start Mack');
  const count=required(await db.from('messages').select('id').eq('thread_id',thread.id).limit(1));
  if(!count.length){const {mackTurn}=await import('./mack.server');await mackTurn(thread.id,data.party,profile.id,request);}
  return{thread_id:thread.id};
 }
 if(data.action==='message'||data.action==='voice'){
  const id=requireId(data.thread_id);const t=required(await user.from('threads').select('*').eq('id',id).single());if(!t)throw new Error('Conversation not found');
  const [a,v]=await Promise.all([t.artist_id?user.from('artists').select('id,user_id').eq('id',t.artist_id).single():Promise.resolve({data:null,error:null}),t.venue_id?user.from('venues').select('id,user_id').eq('id',t.venue_id).single():Promise.resolve({data:null,error:null})]);
  const party:Party=a.data?.user_id===userId?'artist':'venue';const owner=party==='artist'?a.data:v.data;if(!owner||owner.user_id!==userId)throw new Error('Not your conversation');
  if(data.action==='voice')throw new Error('Voice is coming online');
  const content=String(data.content??'').trim();if(!content||content.length>4000)throw new Error('Message must contain 1–4000 characters');
  if(t.booking_id){const b=required(await user.from('bookings').select('status').eq('id',t.booking_id).single());if(b.status==='cancelled'||b.status==='refunded'||b.status==='released')throw new Error('This booking is closed');}
  const db=await admin();const msg=required(await db.from('messages').insert({thread_id:id,sender_role:party,sender_id:userId,content}).select('id').single());
  const {mackTurn}=await import('./mack.server');try{await mackTurn(id,party,owner.id,request);}catch(e){await log('Mack','Reply unavailable',{thread_id:id});throw new Error(`Your message was saved, but Mack could not reply: ${e instanceof Error?e.message:'Please try again later'}`);}
  return{message_id:msg.id};
 }
 if(data.action==='match'){
  const id=requireId(data.venue_id);const v=required(await user.from('venues').select('*').eq('id',id).eq('user_id',userId).single());if(!v)throw new Error('Only the venue can find artists');
  if(!v.intake_completed_at)throw new Error('Finish intake first');
  const db=await admin();const artists=required(await db.from('artists').select('*').not('intake_completed_at','is',null));
  const slots=required(await db.from('availability').select('*'));const existing=required(await db.from('suggestions').select('artist_id,status').eq('venue_id',id));
  const {slotsOnDay}=await import('./availability');const today=new Date().toISOString().slice(0,10);const rows=[];
  for(const a of artists){if(a.user_id===userId||a.vetting==='rejected'||existing.some(s=>s.artist_id===a.id&&s.status!=='suggested'))continue;const overlap=a.genres.filter(g=>v.genres.includes(g));if(!overlap.length||(a.rate_usd??0)>(v.budget_usd??0))continue;
   let match:{date:string;start:string}|null=null;
   for(let n=0;n<28&&!match;n++){const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);const date=d.toISOString().slice(0,10);if(date<(a.start_date??today)||date<(v.start_date??today))continue;
    for(const vs of slotsOnDay(slots.filter(s=>s.owner_type==='venue'&&s.owner_id===id),date))for(const as of slotsOnDay(slots.filter(s=>s.owner_type==='artist'&&s.owner_id===a.id),date)){const start=vs.start_time>as.start_time?vs.start_time:as.start_time;const end=vs.end_time<as.end_time?vs.end_time:as.end_time;const mins=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3,5));if(mins(end)-mins(start)>=Math.max(a.set_length_min??30,v.set_length_min??30)){match={date,start};break;}}
   }
   if(match)rows.push({venue_id:id,artist_id:a.id,slot_date:match.date,slot_start:match.start,score:Math.min(99,65+overlap.length*8+(a.borough===v.borough?8:0)+(a.vetting==='verified'?5:0)),reason:`${overlap.join(' / ')} fits your room, with overlapping availability and a $${a.rate_usd} rate within budget.`});
  }
  if(rows.length)checked(await db.from('suggestions').upsert(rows,{onConflict:'venue_id,artist_id'}));await log('Mack','Artists matched',{count:rows.length});
  const suggestions=required(await user.from('suggestions').select('*,artists(*)').eq('venue_id',id).eq('status','suggested').order('score',{ascending:false}));return{suggestions:suggestions as Suggestion[]};
 }
 if(data.action==='decide'){
  const id=requireId(data.suggestion_id);if(data.decision!=='yes'&&data.decision!=='no')throw new Error('Choose yes or no');
  const s=required(await user.from('suggestions').select('*,venues(*),artists(*)').eq('id',id).single());if(s.venues?.user_id!==userId)throw new Error('Only the venue can choose');const db=await admin();
  if(s.status==='declined')throw new Error('Suggestion already declined');
  if(data.decision==='no'){checked(await db.from('suggestions').update({status:'declined'}).eq('id',id).eq('status','suggested'));await log('Mack','Suggestion declined');return{};}
   const offer=s.artists?.rate_usd??s.venues.budget_usd??0;
   let b=checked(await db.from('bookings').select('*').eq('suggestion_id',id).maybeSingle());if(!b)b=required(await db.from('bookings').insert({venue_id:s.venue_id,artist_id:s.artist_id,suggestion_id:id,gig_date:s.slot_date,start_time:s.slot_start,set_length_min:s.artists?.set_length_min,offer_usd:offer,offer_amount:offer,status:'negotiating'}).select('*').single());
   if(!b)throw new Error('Booking not found');
   let t=checked(await db.from('threads').select('*').eq('booking_id',b.id).maybeSingle());if(!t)t=required(await db.from('threads').insert({kind:'booking',artist_id:b.artist_id,venue_id:b.venue_id,booking_id:b.id}).select('*').single());
   if(!t)throw new Error('Thread not found');
   checked(await db.from('suggestions').update({status:'accepted'}).eq('id',id));
   const msgs=required(await db.from('messages').select('id').eq('thread_id',t.id).limit(1));if(!msgs.length)checked(await db.from('messages').insert({thread_id:t.id,sender_role:'agent',content:`Hey ${s.artists?.name} and ${s.venues.name}! Mack here — you're matched. First step: let's set up a Google Meet video call so you two can meet. What days and times work for each of you this week? After the call, we'll lock in the in-person gig: ${b.gig_date} at ${b.start_time?.slice(0,5)}, ${b.set_length_min} minutes for $${b.offer_usd}.`}));
   const managerThread=async(party:'artist'|'venue',ownerId:string,content:string)=>{const key=party==='artist'?'artist_id':'venue_id';let mt=checked(await db.from('threads').select('*').eq('kind','manager').eq(key,ownerId).maybeSingle());if(!mt)mt=required(await db.from('threads').insert({kind:'manager',...(party==='artist'?{artist_id:ownerId}:{venue_id:ownerId})}).select('*').single());if(mt)checked(await db.from('messages').insert({thread_id:mt.id,sender_role:'agent',content}));};
   await managerThread('venue',s.venue_id,`You confirmed ${s.artists?.name}! They're ${s.artists?.genres.join(' / ')||'a great fit'} from ${s.artists?.borough||'NYC'}, $${s.artists?.rate_usd??offer} for a ${s.artists?.set_length_min??b.set_length_min}-minute set. I've opened a group chat with you both — first we'll find a time for a Google Meet call. When are you free this week?`);
   await managerThread('artist',s.artist_id,`Great news — ${s.venues.name} confirmed you! It's a ${s.venues.venue_type} in ${s.venues.borough} looking for ${s.venues.genres.join(' / ')||'your sound'}. I've opened a group chat with you both — first we'll find a time for a Google Meet call. When are you free this week?`);
   await log('Mack','Booking conversation opened');return{booking_id:b.id,thread_id:t.id};
 }
 const id=requireId(data.booking_id);const b=required(await user.from('bookings').select('*,artists(user_id),venues(user_id)').eq('id',id).single());const party=b.venues?.user_id===userId?'venue':b.artists?.user_id===userId?'artist':null;if(!party)throw new Error('Not part of this booking');
 const db=await admin();
 if(data.action==='confirm'){
  const result=checked(await user.rpc('settle_booking_confirmation',{_booking_id:id,_decline:!!data.decline}));await log('Mack',data.decline?'Booking cancelled':'Booking confirmation');return{status:result as BookingStatus};
 }
 if(data.action==='pay'){
  if(party!=='venue'||b.status!=='confirmed')throw new Error('Only the venue can pay a confirmed booking');
  let p=checked(await db.from('payments').select('*').eq('booking_id',id).maybeSingle());
  if(!p)p=required(await db.from('payments').insert({booking_id:id,...paymentAmounts(b.offer_usd??0)}).select('*').single());
  if(!p)throw new Error('Payment not found');
  await log('Payments','Checkout requested');return{checkout_url:p.checkout_url};
 }
 if(data.action==='report'){
  if(!canReportGig(b.status as BookingStatus,party,b.gig_date,new Date().toISOString().slice(0,10)))throw new Error('Only the venue can report a paid gig after its date');
  // Do not fabricate settlement: real release/refund must be acknowledged by the payment provider.
  throw new Error('Payment release and refunds are coming online with the payment connection');
 }
 throw new Error('Unknown action');
}
export async function handlePublic(data:{action:'live'|'review'|'submitReview';token?:string;input?:ReviewInput}):Promise<PublicResult>{
 const db=await admin();
 if(data.action==='live'){
  const[a,v,s,b,p]=await Promise.all([db.from('artists').select('id',{count:'exact',head:true}),db.from('venues').select('id',{count:'exact',head:true}),db.from('suggestions').select('id',{count:'exact',head:true}),db.from('bookings').select('status'),db.from('payments').select('status,amount_usd,payout_usd')]);
  for(const r of[a,v,s,b,p])if(r.error)throw new Error('Live totals unavailable');const bookings:Record<string,number>={};for(const row of b.data??[])bookings[row.status]=(bookings[row.status]??0)+1;
  return{stats:{artists:a.count??0,venues:v.count??0,suggestions:s.count??0,bookings,held:(p.data??[]).filter(x=>x.status==='held').reduce((n,x)=>n+x.amount_usd,0),released:(p.data??[]).filter(x=>x.status==='released').reduce((n,x)=>n+x.payout_usd,0)}};
 }
 if(!data.token||! /^[a-f0-9]{32}$/i.test(data.token))throw new Error('Review link not found');
 const review=checked(await db.from('expert_reviews').select('id,artist_id,verdict').eq('review_token',data.token).maybeSingle());if(!review)throw new Error('Review link not found');
 if(data.action==='submitReview'){
  const input=data.input;if(!input||!['verified','rejected'].includes(input.verdict)||!Array.isArray(input.room_fit)||input.room_fit.some(r=>!['Bar','Club','Music venue','Restaurant','Café','Rooftop'].includes(r))||typeof input.note!=='string'||input.note.length>500)throw new Error('Check your review');
  const result=required(await db.from('expert_reviews').update({verdict:input.verdict,room_fit:input.room_fit,note:input.note.trim()}).eq('id',review.id).is('verdict',null).select('id'));if(!result.length)throw new Error('This review was already submitted');
  checked(await db.from('artists').update({vetting:input.verdict,vetting_note:input.note.trim()}).eq('id',review.artist_id));await log('Expert booker','Artist review completed',{verdict:input.verdict});return{submitted:true};
 }
 const a=required(await db.from('artists').select('id,name,background,genres,borough,rate_usd,set_length_min,photo_path,video_path').eq('id',review.artist_id).single());
 const slots=required(await db.from('availability').select('*').eq('owner_type','artist').eq('owner_id',a.id));
 const signed=async(path:string|null)=>{if(!path)return null;const r=await db.storage.from('media').createSignedUrl(path,600);const url=r.data?.signedUrl;if(!url)return null;return url.replace(process.env['SUPABASE_URL']??'__none__',import.meta.env['VITE_SUPABASE_URL']);};
 return{artist:{id:a.id,name:a.name,background:a.background,genres:a.genres,borough:a.borough,rate_usd:a.rate_usd,set_length_min:a.set_length_min},availability:slots,photo_url:await signed(a.photo_path),video_url:await signed(a.video_path),submitted:!!review.verdict};
}
