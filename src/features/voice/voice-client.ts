export type VoiceState='idle'|'connecting'|'listening'|'speaking'|'unavailable';
export type VoiceTurn={speaker:'user'|'agent';text:string};
export function createVoiceClient(){let onState:((state:VoiceState)=>void)|undefined;return{start(_thread_id:string,callbacks:{onTurn:(turn:VoiceTurn)=>void;onState:(state:VoiceState)=>void}){onState=callbacks.onState;onState('unavailable');},stop(){onState?.('idle');},mute(_on:boolean){}};}
