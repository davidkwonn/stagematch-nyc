import { describe, it, expect } from 'vitest';
import { paymentAmounts, canReportGig, intakeComplete } from '@/data/rules';
import { validateSlot, slotsOnDay } from '@/data/availability';
import type { Availability } from '@/data/types';
describe('Hackathon rules',()=>{
 it('takes exactly 15 percent and pays the artist the remainder',()=>{expect(paymentAmounts(200)).toEqual({amount_usd:200,fee_usd:30,payout_usd:170});});
 it('only allows venue outcome reporting after the gig date',()=>{expect(canReportGig('paid_held','venue','2026-11-07','2026-11-08')).toBe(true);expect(canReportGig('paid_held','artist','2026-11-07','2026-11-08')).toBe(false);expect(canReportGig('paid_held','venue','2026-11-07','2026-11-07')).toBe(false);expect(canReportGig('confirmed','venue','2026-11-07','2026-11-08')).toBe(false);});
 it('requires every artist intake fact plus an availability slot',()=>{const p={start_date:'2026-11-01',set_length_min:45,rate_usd:200,goals:'Book NYC shows'};expect(intakeComplete(p,'artist',1)).toBe(true);expect(intakeComplete(p,'artist',0)).toBe(false);for(const key of ['start_date','set_length_min','rate_usd','goals'])expect(intakeComplete({...p,[key]:null},'artist',1)).toBe(false);});
 it('requires venue capacity in addition to budget and other intake fields',()=>{const p={start_date:'2026-11-01',set_length_min:45,budget_usd:300,capacity:100,goals:'Friday acts'};expect(intakeComplete(p,'venue',1)).toBe(true);expect(intakeComplete({...p,capacity:null},'venue',1)).toBe(false);expect(intakeComplete({...p,budget_usd:null},'venue',1)).toBe(false);});
 it('marks weekly slots on their weekday and date slots only on the specified date',()=>{const weekly={id:'weekly',kind:'weekly',weekday:5} as Availability;const dated={id:'dated',kind:'date',date:'2026-11-07'} as Availability;expect(slotsOnDay([weekly,dated],'2026-11-06').map(s=>s.id)).toEqual(['weekly']);expect(slotsOnDay([weekly,dated],'2026-11-13').map(s=>s.id)).toEqual(['weekly']);expect(slotsOnDay([weekly,dated],'2026-11-07').map(s=>s.id)).toEqual(['dated']);});
 it('rejects a date slot without a date and a slot ending before it starts',()=>{expect(()=>validateSlot({kind:'date',start_time:'19:00',end_time:'23:00'})).toThrow();expect(()=>validateSlot({kind:'weekly',weekday:5,start_time:'23:00',end_time:'19:00'})).toThrow();});
});
