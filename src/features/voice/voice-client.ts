import { startVoiceSession, saveVoiceTurns } from '@/data/api';
// Mack by voice: GPT-Live over WebRTC, on the same thread as the chat.
// The browser holds the call; turns are saved into the thread, and Mack's backend answers the voice model's
// delegations (session.commentary.append) and sends notes after each user turn (session.thinking.append).
export type VoiceState='idle'|'connecting'|'listening'|'speaking'|'unavailable';
export type VoiceTurn={speaker:'user'|'agent';text:string};
type Callbacks={onTurn:(turn:VoiceTurn)=>void;onState:(state:VoiceState)=>void};
const TURN_GAP_MS=1500,SPEAKING_IDLE_MS=900,RELAY_WAIT_MS=700,ICE_WAIT_MS=2500,CHUNK_BYTES=450;
// Live appends are capped (500 tokens): send long text as word-aligned chunks.
function chunks(text:string){const out:string[]=[];let cur='';for(const word of text.split(/(?<=\s)/)){if(new TextEncoder().encode(cur+word).length>CHUNK_BYTES&&cur){out.push(cur);cur='';}cur+=word;}if(cur.trim())out.push(cur);return out;}
export function createVoiceClient(){
 let pc:RTCPeerConnection|null=null,dc:RTCDataChannel|null=null,stream:MediaStream|null=null,audio:HTMLAudioElement|null=null;
 let threadId='',cb:Callbacks|null=null,active=false,greeting='';
 let current:VoiceTurn|null=null,pending:VoiceTurn[]=[],busy:Promise<void>=Promise.resolve();
 let gapTimer:ReturnType<typeof setTimeout>|undefined,speakTimer:ReturnType<typeof setTimeout>|undefined,relayTimer:ReturnType<typeof setTimeout>|undefined;
 const setState=(s:VoiceState)=>cb?.onState(s);
 const send=(event:Record<string,unknown>)=>{if(dc?.readyState==='open')dc.send(JSON.stringify(event));};
 const append=(kind:'instructions'|'thinking'|'commentary',content:string,delegationId:string|null=null)=>{for(const part of chunks(content))send({type:`session.${kind}.append`,event_id:crypto.randomUUID(),delegation_id:delegationId,content:part});};
 function finishTurn(){
  clearTimeout(gapTimer);if(!current)return;const turn={speaker:current.speaker,text:current.text.trim()};current=null;if(!turn.text)return;
  cb?.onTurn(turn);pending.push(turn);
  // A user turn the voice model doesn't delegate still goes to the backend, so facts said by voice are saved.
  if(turn.speaker==='user'){clearTimeout(relayTimer);relayTimer=setTimeout(()=>void flush(),RELAY_WAIT_MS);}
 }
 function flush(delegationId?:string){
  clearTimeout(relayTimer);const turns=pending;pending=[];if(!turns.length&&!delegationId)return busy;
  busy=busy.then(async()=>{
   try{const r=await saveVoiceTurns(threadId,turns,delegationId);if(!active)return;if(delegationId)append('commentary',r.say||'Done.',delegationId);else if(r.note)append('thinking',r.note);}
   catch{if(active&&delegationId)append('commentary','The backend could not save that just now. Tell the user plainly and ask them to repeat it.',delegationId);}
  });
  return busy;
 }
 function heard(speaker:'user'|'agent',delta:string){
  if(current&&current.speaker!==speaker)finishTurn();
  current??={speaker,text:''};current.text+=delta;
  clearTimeout(gapTimer);gapTimer=setTimeout(finishTurn,TURN_GAP_MS);
  if(speaker==='agent'){setState('speaking');clearTimeout(speakTimer);speakTimer=setTimeout(()=>active&&setState('listening'),SPEAKING_IDLE_MS);}
 }
 function receive(raw:unknown){
  if(typeof raw!=='string')return;let event:{type?:string;delta?:string;delegation?:{id?:string};error?:unknown};try{event=JSON.parse(raw);}catch{return;}
  switch(event.type){
   case 'session.started':setState('listening');if(greeting)append('instructions',greeting);break;
   case 'session.input_transcript.delta':if(typeof event.delta==='string')heard('user',event.delta);break;
   case 'session.output_transcript.delta':if(typeof event.delta==='string')heard('agent',event.delta);break;
   case 'session.delegation.created':if(current?.speaker==='user')finishTurn();if(event.delegation?.id)void flush(event.delegation.id);break;
   case 'session.closed':void stop();break;
   case 'error':console.warn('[voice]',event.error);break;
  }
 }
 async function stop(){
  if(!active){setState('idle');return;}
  active=false;finishTurn();const saving=flush();
  send({type:'session.close',event_id:crypto.randomUUID()});
  clearTimeout(gapTimer);clearTimeout(speakTimer);clearTimeout(relayTimer);
  dc?.close();pc?.close();stream?.getTracks().forEach(t=>t.stop());if(audio)audio.srcObject=null;
  dc=null;pc=null;stream=null;setState('idle');
  await saving.catch(()=>{});
 }
 return{
  // Call from a tap: iOS Safari only grants the mic and audio playback inside a user gesture.
  async start(thread_id:string,callbacks:Callbacks){
   if(active)return;cb=callbacks;threadId=thread_id;
   if(typeof window==='undefined'||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){setState('unavailable');return;}
   active=true;setState('connecting');
   audio=new Audio();audio.autoplay=true;audio.setAttribute('playsinline','');void audio.play().catch(()=>{});
   try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const peer=new RTCPeerConnection();pc=peer;
    peer.ontrack=e=>{if(audio){audio.srcObject=e.streams[0]??new MediaStream([e.track]);void audio.play().catch(()=>{});}};
    peer.onconnectionstatechange=()=>{if(active&&['failed','closed'].includes(peer.connectionState))void stop();};
    const track=stream.getAudioTracks()[0];if(!track)throw new Error('No microphone found');peer.addTrack(track,stream);
    dc=peer.createDataChannel('oai-events');dc.onmessage=e=>receive(e.data);
    await peer.setLocalDescription(await peer.createOffer());
    await new Promise<void>(resolve=>{if(peer.iceGatheringState==='complete')return resolve();const t=setTimeout(resolve,ICE_WAIT_MS);peer.addEventListener('icegatheringstatechange',()=>{if(peer.iceGatheringState==='complete'){clearTimeout(t);resolve();}});});
    const session=await startVoiceSession(thread_id,peer.localDescription?.sdp??'');
    if(!active)return;greeting=session.greeting;
    await peer.setRemoteDescription({type:'answer',sdp:session.sdp});
   }catch(e){await stop();throw e;}
  },
  stop,
  mute(on:boolean){stream?.getAudioTracks().forEach(t=>{t.enabled=!on;});},
 };
}
