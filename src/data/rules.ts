import type { BookingStatus } from './types';
export function paymentAmounts(amount:number){const cents=Math.round(amount*100);const fee=Math.round(cents*0.15);return{amount_usd:cents/100,fee_usd:fee/100,payout_usd:(cents-fee)/100};}
// From the gig day on; gig-outcome accepts a payout only after the show's end (New York time) and says when.
export function canReportGig(status:BookingStatus,party:string,date:string|null,today:string){return status==='paid_held'&&party==='venue'&&!!date&&date<=today;}
export function intakeComplete(profile:{start_date:string|null;set_length_min:number|null;goals:string|null;rate_usd?:number|null;budget_usd?:number|null;capacity?:number|null},party:string,slotCount:number){return slotCount>0&&!!profile.start_date&&(profile.set_length_min??0)>0&&!!profile.goals?.trim()&&(party==='artist'?(profile.rate_usd??0)>0:(profile.budget_usd??0)>0&&(profile.capacity??0)>0);}
