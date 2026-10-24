import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Booking } from './types';
export const bookingsQuery=queryOptions({queryKey:['bookings'],queryFn:async()=>{const{data,error}=await supabase.from('bookings').select('*,artists(*),venues(*)').order('gig_date');if(error)throw error;return(data??[]) as Booking[];}});
export const paymentQuery=(id:string)=>queryOptions({queryKey:['payments',id],queryFn:async()=>{const{data,error}=await supabase.from('payments').select('*').eq('booking_id',id).maybeSingle();if(error)throw error;return data;}});
export const STATUS_LABEL:Record<string,string>={negotiating:'Negotiating',confirmed:'Confirmed',paid_held:'Paid and held',performed:'Performed',released:'Paid out',refunded:'Refunded',cancelled:'Cancelled'};
