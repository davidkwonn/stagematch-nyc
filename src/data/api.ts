import { backendAction, publicAction } from './backend.functions';
import { supabase } from '@/integrations/supabase/client';
import type { Party, BookingStatus, Suggestion, ReviewInput } from './types';
// edge function: mack-start
export async function startMack(party:Party):Promise<{thread_id:string}>{const r=await backendAction({data:{action:'start',party}});return{thread_id:r.thread_id??''};}
// edge function: mack-chat
export async function sendMessage(thread_id:string,content:string):Promise<{message_id:string}>{const r=await backendAction({data:{action:'message',thread_id,content}});return{message_id:r.message_id??''};}
// edge function: voice-session
export async function startVoiceSession(thread_id:string,sdp:string):Promise<{sdp:string;greeting:string}>{const r=await backendAction({data:{action:'voiceSession',thread_id,sdp}});if(!r.sdp)throw new Error('Voice could not connect');return{sdp:r.sdp,greeting:r.greeting??''};}
// edge function: voice-turns — saves voice turns; with delegation_id, returns what Mack's voice should say (`say`), otherwise an optional backend note
export async function saveVoiceTurns(thread_id:string,turns:{speaker:'user'|'agent';text:string}[],delegation_id?:string):Promise<{ok:true;say?:string;note?:string}>{const r=await backendAction({data:{action:'voice',thread_id,turns,...(delegation_id?{delegation_id}:{})}});return{ok:true,...(r.say?{say:r.say}:{}),...(r.note?{note:r.note}:{})};}
// edge function: match
export async function findArtists(venue_id:string):Promise<{suggestions:Suggestion[]}>{const r=await backendAction({data:{action:'match',venue_id}});return{suggestions:r.suggestions??[]};}
// edge function: suggestion-decision
export async function decideSuggestion(suggestion_id:string,decision:'yes'|'no'):Promise<{booking_id?:string;thread_id?:string}>{const r=await backendAction({data:{action:'decide',suggestion_id,decision}});return{...(r.booking_id?{booking_id:r.booking_id}:{}),...(r.thread_id?{thread_id:r.thread_id}:{})};}
// edge function: booking-confirm
export async function confirmBooking(booking_id:string,decline?:boolean):Promise<{status:BookingStatus}>{const r=await backendAction({data:{action:'confirm',booking_id,decline:!!decline}});if(!r.status)throw new Error('Booking not updated');return{status:r.status};}
// edge function: whop-checkout
export async function payBooking(booking_id:string):Promise<{checkout_url:string|null}>{const{data,error}=await supabase.functions.invoke('whop-checkout',{body:{booking_id}});if(error)throw new Error((await error.context?.json?.().catch(()=>null))?.error??error.message);return{checkout_url:data?.checkout_url??null};}
// edge function: gig-outcome
export async function reportGig(booking_id:string,performed:boolean):Promise<{status:BookingStatus}>{const{data,error}=await supabase.functions.invoke('gig-outcome',{body:{booking_id,performed}});if(error)throw new Error((await error.context?.json?.().catch(()=>null))?.error??error.message);if(!data?.status)throw new Error('Outcome not updated');return{status:data.status};}
// edge function: expert-review
export async function getReview(token:string){return publicAction({data:{action:'review',token}});}
// edge function: expert-review
export async function submitReview(token:string,input:ReviewInput){return publicAction({data:{action:'submitReview',token,input}});}
