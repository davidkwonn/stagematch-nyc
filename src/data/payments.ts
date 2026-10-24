import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getMe } from './profiles';
import { subscribeLive } from './realtime';
import type { Row, Booking } from './types';

export type Payment = Pick<Row<'payments'>, 'amount_usd' | 'fee_usd' | 'payout_usd' | 'status' | 'created_at' | 'updated_at'>;
export type WalletPayment = Payment & { id: string; booking_id: string; bookings: Pick<Booking, 'id' | 'gig_date' | 'artists' | 'venues'> };
const paymentFields = 'amount_usd,fee_usd,payout_usd,status,created_at,updated_at';

export const paymentQuery = (booking_id: string) => queryOptions({
  queryKey: ['payments', booking_id],
  queryFn: async (): Promise<Payment | null> => {
    const { data, error } = await supabase.from('payments').select(paymentFields).eq('booking_id', booking_id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const paymentEventsQuery = (booking_id: string) => queryOptions({
  queryKey: ['payment-events', booking_id],
  queryFn: async () => {
    const { data, error } = await supabase.from('agent_log').select('id,at,agent,action,detail').eq('agent', 'payments').eq('detail->>booking_id', booking_id).order('at');
    if (error) throw error;
    return data ?? [];
  },
});

export const walletQuery = () => queryOptions({
  queryKey: ['wallet'],
  queryFn: async (): Promise<{ party: 'artist' | 'venue'; payments: WalletPayment[] }> => {
    const me = await getMe();
    if (!me.user) throw new Error('Please sign in');
    const party = me.artist ? 'artist' : 'venue';
    const profile = me.artist ?? me.venue;
    if (!profile) return { party, payments: [] };
    const { data, error } = await supabase.from('payments')
      .select(`id,booking_id,${paymentFields},bookings!inner(id,gig_date,artists(*),venues(*))`)
      .eq(`bookings.${party}_id`, profile.id).order('created_at', { ascending: false });
    if (error) throw error;
    return { party, payments: (data ?? []) as WalletPayment[] };
  },
});

// Reuse the existing unique-channel subscription and teardown, without changing teammate files.
export function usePaymentLiveData() {
  const qc = useQueryClient();
  useEffect(() => subscribeLive(() => {
    for (const queryKey of [['payments'], ['payment-events'], ['wallet']]) void qc.invalidateQueries({ queryKey });
  }, ['payments', 'agent_log']), [qc]);
}