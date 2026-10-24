import { useSuspenseQuery } from '@tanstack/react-query';
import { Wallet as WalletIcon } from 'lucide-react';
import { walletQuery, usePaymentLiveData } from '@/data/payments';
import { PaymentStatus } from './PaymentSection';
import { usd, walletTotals } from './payment-display';

export function Wallet() {
  const { data } = useSuspenseQuery(walletQuery());
  usePaymentLiveData();
  const totals = walletTotals(data.payments, data.party);
  const artist = data.party === 'artist';
  const metrics = artist ? [['Total paid out', totals.paid], ['Total on hold', totals.held]] : [['Total paid', totals.paid], ['On hold', totals.held], ['Refunded', totals.refunded]];
  return <section aria-label="Wallet" className="mt-10 border-y-2 border-border py-6">
    <h2 className="flex items-center gap-2 font-display text-3xl"><WalletIcon className="size-6 text-primary"/>Wallet<span className="ml-auto font-sans text-xs text-muted-foreground">USD</span></h2>
    <dl className="my-6 grid grid-cols-2 gap-5 sm:grid-cols-3">{metrics.map(([label, amount]) => <div key={label} className="border-l-2 border-secondary pl-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-bold tabular-nums">{usd(Number(amount))}</dd></div>)}</dl>
    {data.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3 pr-4">Gig date</th><th className="pr-4">{artist ? 'Venue' : 'Artist'}</th><th className="pr-4 text-right">{artist ? 'Payout' : 'Amount'}</th><th className="pl-4">Status</th></tr></thead><tbody>{data.payments.map(p => <tr key={p.id} className="border-b border-border"><td className="whitespace-nowrap py-4 pr-4">{p.bookings.gig_date ?? 'Date TBD'}</td><td className="min-w-28 pr-4">{artist ? p.bookings.venues?.name : p.bookings.artists?.name}</td><td className="whitespace-nowrap pr-4 text-right font-bold tabular-nums">{usd(artist ? p.payout_usd : p.amount_usd)}</td><td className="pl-4"><PaymentStatus status={p.status}/></td></tr>)}</tbody></table></div>}
  </section>;
}