import { useQuery } from '@tanstack/react-query';
import { ChevronDown, CreditCard } from 'lucide-react';
import { paymentQuery, paymentEventsQuery, usePaymentLiveData } from '@/data/payments';
import { PAYMENT_EVENT_LABELS, PAYMENT_STATUS, usd } from './payment-display';

export function PaymentStatus({ status }: { status: keyof typeof PAYMENT_STATUS }) {
  return <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-[10px] font-bold uppercase ${status === 'released' ? 'border-mint text-mint' : status === 'held' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>{PAYMENT_STATUS[status]}</span>;
}

export function PaymentSection({ bookingId }: { bookingId: string }) {
  const payment = useQuery(paymentQuery(bookingId));
  const events = useQuery(paymentEventsQuery(bookingId));
  usePaymentLiveData();
  return <details open className="mt-4 border-t border-border pt-3">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold"><CreditCard className="size-4 text-primary"/>Payment<ChevronDown className="ml-auto size-4"/></summary>
    <div className="mt-3">
      {payment.isPending ? <p className="text-xs text-muted-foreground">Loading payment…</p> : payment.isError ? <p role="alert" className="text-xs text-destructive">Payment details unavailable.</p> : payment.data ? <>
        <div className="mb-3"><PaymentStatus status={payment.data.status}/></div>
        <dl className="grid gap-3 text-xs sm:grid-cols-3">{[['Amount', payment.data.amount_usd], ['Stagehand fee (15%)', payment.data.fee_usd], ['Artist payout', payment.data.payout_usd]].map(([label, amount]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 text-base font-bold tabular-nums">{usd(Number(amount))}</dd></div>)}</dl>
      </> : <p className="text-xs text-muted-foreground">No payment yet.</p>}
      <h3 className="mt-5 text-xs font-bold">Timeline</h3>
      {events.isPending ? <p className="mt-2 text-xs text-muted-foreground">Loading activity…</p> : events.isError ? <p role="alert" className="mt-2 text-xs text-destructive">Payment activity unavailable.</p> : <ol className="mt-2 space-y-3">{events.data.filter(event => PAYMENT_EVENT_LABELS[event.action]).map(event => {
        const simulated = event.detail && typeof event.detail === 'object' && !Array.isArray(event.detail) && event.detail.simulated === true;
        return <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l border-border pl-3 text-xs"><time dateTime={event.at} className="text-muted-foreground">{new Date(event.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time><span>{PAYMENT_EVENT_LABELS[event.action]}</span>{simulated && <span className="border border-secondary px-1.5 py-0.5 text-[10px] text-secondary">Test mode</span>}</li>;
      })}</ol>}
      {events.data?.filter(event => PAYMENT_EVENT_LABELS[event.action]).length === 0 && <p className="mt-2 text-xs text-muted-foreground">No payment activity yet.</p>}
    </div>
  </details>;
}