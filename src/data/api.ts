import { backendAction, publicAction } from './backend.functions';
import type { Party, BookingStatus, Suggestion, ReviewInput } from './types';
// edge function: mack-start
export async function startMack(party:Party):Promise<{thread_id:string}>{const r=await backendAction({data:{action:'start',party}});return{thread_id:r.thread_id??''};}
// edge function: mack-chat
export async function sendMessage(thread_id:string,content:string):Promise<{message_id:string}>{const r=await backendAction({data:{action:'message',thread_id,content}});return{message_id:r.message_id??''};}
// edge function: voice-turns
export async function saveVoiceTurns(thread_id:string,turns:{speaker:'user'|'agent';text:string}[]):Promise<{ok:true}>{await backendAction({data:{action:'voice',thread_id,turns}});return{ok:true};}
// edge function: match
export async function findArtists(venue_id:string):Promise<{suggestions:Suggestion[]}>{const r=await backendAction({data:{action:'match',venue_id}});return{suggestions:r.suggestions??[]};}
// edge function: suggestion-decision
export async function decideSuggestion(suggestion_id:string,decision:'yes'|'no'):Promise<{booking_id?:string;thread_id?:string}>{const r=await backendAction({data:{action:'decide',suggestion_id,decision}});return{...(r.booking_id?{booking_id:r.booking_id}:{}),...(r.thread_id?{thread_id:r.thread_id}:{})};}
// edge function: booking-confirm
export async function confirmBooking(booking_id:string,decline?:boolean):Promise<{status:BookingStatus}>{const r=await backendAction({data:{action:'confirm',booking_id,decline:!!decline}});if(!r.status)throw new Error('Booking not updated');return{status:r.status};}
// edge function: whop-checkout
export async function payBooking(booking_id:string):Promise<{checkout_url:string|null}>{const r=await backendAction({data:{action:'pay',booking_id}});return{checkout_url:r.checkout_url??null};}
// edge function: gig-outcome
export async function reportGig(booking_id:string,performed:boolean):Promise<{status:BookingStatus}>{const r=await backendAction({data:{action:'report',booking_id,performed}});if(!r.status)throw new Error('Outcome not updated');return{status:r.status};}
// edge function: expert-review
export async function getReview(token:string){return publicAction({data:{action:'review',token}});}
// edge function: expert-review
export async function submitReview(token:string,input:ReviewInput){return publicAction({data:{action:'submitReview',token,input}});}
