import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Party, BookingStatus, Suggestion, ReviewInput, Artist, Availability } from './types';
export type ActionInput={action:'start'|'message'|'voice'|'voiceSession'|'match'|'decide'|'confirm'|'pay'|'report';party?:Party;thread_id?:string;content?:string;turns?:{speaker:'user'|'agent';text:string}[];sdp?:string;delegation_id?:string;venue_id?:string;suggestion_id?:string;decision?:'yes'|'no';booking_id?:string;decline?:boolean;performed?:boolean};
export type ActionResult={thread_id?:string;message_id?:string;suggestions?:Suggestion[];booking_id?:string;status?:BookingStatus;checkout_url?:string|null;sdp?:string;greeting?:string;say?:string;note?:string};
export const backendAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:ActionInput)=>input).handler(async({data,context}):Promise<ActionResult>=>{
 const {handleAction}=await import('./backend.server');
 return handleAction(data,context.supabase,context.userId,getRequest());
});
export type PublicResult={artist?:Pick<Artist,'id'|'name'|'background'|'genres'|'borough'|'rate_usd'|'set_length_min'>;photo_url?:string|null;video_url?:string|null;availability?:Availability[];submitted?:boolean;stats?:{artists:number;venues:number;suggestions:number;bookings:Record<string,number>;held:number;released:number}};
export const publicAction=createServerFn({method:'POST'}).inputValidator((input:{action:'live'|'review'|'submitReview';token?:string;input?:ReviewInput})=>input).handler(async({data}):Promise<PublicResult>=>{
 const {handlePublic}=await import('./backend.server');return handlePublic(data);
});
