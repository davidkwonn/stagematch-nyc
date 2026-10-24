// live-stats (no JWT): aggregate counters for the public /live demo screen.
// /live is signed out and RLS hides bookings, payments and suggestions from anon,
// so the page reads these totals here. Counts and sums only, never rows.

import { json, serve } from '../_shared/cors.ts';
import { db } from '../_shared/db.ts';

const count = async (table: string) => {
  const { count: n, error } = await db.from(table).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return n ?? 0;
};

const round = (n: number) => Math.round(n * 100) / 100;

serve(async () => {
  const [artists, venues, suggestions, verified, bookings, payments] = await Promise.all([
    count('artists'),
    count('venues'),
    count('suggestions'),
    db.from('artists').select('id', { count: 'exact', head: true }).eq('vetting', 'verified'),
    db.from('bookings').select('status'),
    db.from('payments').select('status, amount_usd, fee_usd, payout_usd'),
  ]);
  for (const r of [verified, bookings, payments]) if (r.error) throw r.error;

  const byStatus: Record<string, number> = {};
  for (const b of bookings.data ?? []) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;

  let held = 0, paidOut = 0, fees = 0, refunded = 0;
  for (const p of payments.data ?? []) {
    if (p.status === 'held') held += Number(p.amount_usd);
    if (p.status === 'released') { paidOut += Number(p.payout_usd); fees += Number(p.fee_usd); }
    if (p.status === 'refunded') refunded += Number(p.amount_usd);
  }

  return json({
    artists, venues, verified_artists: verified.count ?? 0, suggestions,
    bookings: byStatus,
    money: { held_usd: round(held), paid_out_usd: round(paidOut), fees_usd: round(fees), refunded_usd: round(refunded) },
  });
});
