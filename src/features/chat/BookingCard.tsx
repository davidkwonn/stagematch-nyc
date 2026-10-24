import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, X, CreditCard, CalendarDays, Clock, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmBooking, payBooking, reportGig } from '@/data/api';
import { paymentQuery, STATUS_LABEL } from '@/data/bookings';
import { canReportGig } from '@/data/rules';
import type { Booking, Party } from '@/data/types';
export function BookingCard({booking:b,party}:{booking:Booking;party:Party}){
 const {data:payment}=useQuery(paymentQuery(b.id));const qc=useQueryClient();const[busy,setBusy]=useState(false);
 const mine=party==='artist'?b.artist_confirmed:b.venue_confirmed;
 async function act(fn:()=>Promise<unknown>){setBusy(true);try{await fn();await qc.invalidateQueries();}catch(e){toast.error(e instanceof Error?e.message:'Could not update booking');}finally{setBusy(false);}}
 return <section className="border-b-2 border-border bg-muted px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-2xl">{party==='artist'?b.venues?.name:b.artists?.name}</h2><span className="bg-secondary px-2 py-1 text-[10px] font-bold uppercase text-secondary-foreground">{STATUS_LABEL[b.status]}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span className="flex items-center gap-1"><CalendarDays className="size-3"/>{b.gig_date??'Date TBD'}</span><span className="flex items-center gap-1"><Clock className="size-3"/>{b.start_time?.slice(0,5)??'Time TBD'}</span><span>{b.set_length_min??'—'} min set</span><span className="flex items-center gap-1"><DollarSign className="size-3"/>{b.offer_usd??'Pay TBD'}</span></div>{payment&&<div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3 text-xs"><span>Payment: {payment.status}</span><span>Amount ${payment.amount_usd.toFixed(2)}</span><span>15% fee ${payment.fee_usd.toFixed(2)}</span><span>Artist ${payment.payout_usd.toFixed(2)}</span></div>}
 {b.status==='negotiating'&&<div className="mt-3 flex flex-wrap gap-2"><Button variant="acid" size="sm" disabled={busy||mine||!b.gig_date||!b.start_time||!b.set_length_min||!b.offer_usd} onClick={()=>act(()=>confirmBooking(b.id))}><Check className="size-4"/>{mine?'You confirmed':'Confirm'}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>act(()=>confirmBooking(b.id,true))}><X className="size-4"/>Decline</Button><span className="self-center text-xs text-muted-foreground">{b.artist_confirmed?'Artist ✓':'Artist —'} · {b.venue_confirmed?'Venue ✓':'Venue —'}</span></div>}
 {b.status==='confirmed'&&(party==='venue'?<Button variant="poster" size="sm" className="mt-3" disabled={busy} onClick={()=>{const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;void act(async()=>{const r=await payBooking(b.id);if(r.checkout_url&&/^https:\/\//.test(r.checkout_url)){if(tab)tab.location.href=r.checkout_url;}else{tab?.close();toast.info('Payments are coming online. No money has been charged.');}});}}><CreditCard className="size-4"/>Pay and hold</Button>:<p className="mt-3 text-xs text-secondary">Waiting for the venue's payment</p>)}
 {canReportGig(b.status,party,b.gig_date,new Date().toISOString().slice(0,10))&&<div className="mt-3 flex gap-2"><Button variant="acid" disabled={busy} onClick={()=>act(()=>reportGig(b.id,true))}>It happened</Button><Button variant="paper" disabled={busy} onClick={()=>act(()=>reportGig(b.id,false))}>No-show</Button></div>}</section>;
}
