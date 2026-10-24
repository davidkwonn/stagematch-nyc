import { VOICE_PROMPT } from './mack-prompt';
import { mackContext, mackTurn } from './mack.server';
import { logDecision } from './live';
import type { ActionInput, ActionResult } from './backend.functions';
import type { Party } from './types';
// GPT-Live over WebRTC. The browser holds the call; this server creates the session from the thread's context,
// saves the voice turns into the same thread, and runs Mack's backend on them (the voice model has no tools).
const SERVER_EVENTS=['session.started','session.closed','session.usage.updated','session.delegation.created','session.input_transcript.delta','session.output_transcript.delta','error'];
const CLIENT_EVENTS=['session.instructions.append','session.thinking.append','session.commentary.append','session.close'];
type Turn={speaker:'user'|'agent';text:string};
export async function handleVoice(data:ActionInput,threadId:string,party:Party,ownerId:string,userId:string,request:Request):Promise<ActionResult>{
 return data.action==='voiceSession'?createSession(data.sdp,threadId,party,ownerId):processTurns(data.turns,data.delegation_id,threadId,party,ownerId,userId,request);
}
async function createSession(sdp:unknown,threadId:string,party:Party,ownerId:string):Promise<ActionResult>{
 const key=process.env['OPENAI_API_KEY'];if(!key)throw new Error('Voice is not configured yet');
 if(typeof sdp!=='string'||!sdp.trim()||sdp.length>65536)throw new Error('Invalid voice offer');
 const{context,messages,db}=await mackContext(threadId,party,ownerId);
 const conversation=messages.slice(-40).map(m=>`${m.sender_role==='agent'?'Mack':m.sender_role}${m.channel==='voice'?' (voice)':''}: ${m.content.slice(0,400)}`);
 const instructions=`${VOICE_PROMPT}\nTrusted context: ${JSON.stringify({...context,conversation})}`;
 const res=await fetch('https://api.openai.com/v1/live/sessions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({
  session:{model:process.env['VOICE_MODEL']||'gpt-live-1',store:false,delegation:{type:'client'},audio:{output:{voice:process.env['VOICE_NAME']||'marin'}},instructions,
   client:{data_channel:{allowed_client_events:CLIENT_EVENTS,allowed_server_events:SERVER_EVENTS}}},
  transport:{type:'webrtc',sdp}})});
 if(!res.ok){const detail=(await res.text()).slice(0,300);await logDecision('Mack','Voice call failed',{status:res.status,detail},db);throw new Error(`Voice could not connect (${res.status})`);}
 const body=await res.json() as {session?:{id?:string};transport?:{sdp?:string}};
 if(!body.transport?.sdp)throw new Error('Voice could not connect');
 await logDecision('Mack','Voice call started',{thread_id:threadId,party},db);
 return{sdp:body.transport.sdp,greeting:greeting(party,context.kind,context.missing,messages.length>0)};
}
// Sent on session.started with session.instructions.append (max 500 tokens).
function greeting(party:Party,kind:string,missing:string[],resumed:boolean){
 if(!resumed)return `Start the call now. Say: "Hi, I'm Mack, your booking manager at Stagehand. Let's set up your calendar." Then ask ${party==='artist'?'which nights they are free to play':'which nights they want live music'}, with start and end times.`;
 if(kind==='manager'&&missing.length)return `Start the call now. Say: "Picking up where we left off." In one sentence, recall what you already have, then ask about their ${missing[0]}.`;
 return 'Start the call now. Say: "Picking up where we left off." Then ask how you can help.';
}
async function processTurns(input:unknown,delegationId:string|undefined,threadId:string,party:Party,ownerId:string,userId:string,request:Request):Promise<ActionResult>{
 const turns=(Array.isArray(input)?input:[]).filter((t:Turn)=>t&&(t.speaker==='user'||t.speaker==='agent')&&typeof t.text==='string'&&t.text.trim()).slice(0,30).map((t:Turn)=>({speaker:t.speaker,text:t.text.trim().slice(0,2000)}));
 const{ supabaseAdmin:db }=await import('@/integrations/supabase/client.server');
 // Agent turns come from the browser transcript: they are stored for the shared context only; only user turns trigger Mack's backend.
 if(turns.length){const{error}=await db.from('messages').insert(turns.map(t=>({thread_id:threadId,sender_role:t.speaker==='user'?party:'agent' as const,sender_id:t.speaker==='user'?userId:null,channel:'voice' as const,content:t.text})));if(error)throw new Error(error.message);}
 if(!delegationId&&!turns.some(t=>t.speaker==='user'))return{};
 let r;
 try{r=await mackTurn(threadId,party,ownerId,request,{post:false,source:'voice'});}
 catch(e){await logDecision('Mack','Voice backend unavailable',{error:e instanceof Error?e.message:String(e)},db);
  return delegationId?{say:'The backend could not save that just now. Tell the user plainly and ask them to repeat it.'}:{};}
 const note=[r.saved.length&&`Saved: ${r.saved.join('; ')}.`,r.intakeCompleted&&'Intake complete: the calendar is ready.',r.matches.length&&`Top artists, also posted in the chat: ${r.matches.join(', ')}.`,!r.intakeCompleted&&r.missing.length&&`Still missing: ${r.missing.join(', ')}.`].filter(Boolean).join(' ');
 await logDecision('Mack','Voice turns processed',{saved:r.saved.length,delegated:!!delegationId,intake_completed:r.intakeCompleted},db);
 if(delegationId)return{say:[r.saved.length||r.intakeCompleted?note:'',r.reply].filter(Boolean).join(' ')||note||'Nothing new to save.'};
 return r.saved.length||r.intakeCompleted?{note}:{};
}
