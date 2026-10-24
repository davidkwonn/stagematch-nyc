import type { Payment } from '@/data/payments';

export const PAYMENT_STATUS = {
  pending: 'Awaiting payment', held: 'Paid, held', released: 'Paid out', refunded: 'Refunded',
} satisfies Record<Payment['status'], string>;

export const PAYMENT_EVENT_LABELS: Record<string, string> = {
  checkout_created: 'Checkout opened', checkout_simulated: 'Checkout opened',
  payment_held: 'Payment received and held', gig_performed: 'Show confirmed',
  payout_sent: 'Artist paid', payout_simulated: 'Artist paid', payout_pending: 'Payout pending at Whop',
  payout_needs_review: 'Needs review', payment_held_needs_review: 'Needs review',
  gig_no_show: 'No-show reported', refund_issued: 'Refunded to venue', refund_simulated: 'Refunded to venue',
  refund_failed: 'Refund failed',
};

export const usd = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));
export function walletTotals(payments: Payment[], party: 'artist' | 'venue') {
  const sum = (statuses: Payment['status'][], field: 'amount_usd' | 'payout_usd') =>
    payments.filter(p => statuses.includes(p.status)).reduce((total, p) => total + Number(p[field]), 0);
  return party === 'artist'
    ? { paid: sum(['released'], 'payout_usd'), held: sum(['held'], 'payout_usd'), refunded: 0 }
    : { paid: sum(['held', 'released'], 'amount_usd'), held: sum(['held'], 'amount_usd'), refunded: sum(['refunded'], 'amount_usd') };
}