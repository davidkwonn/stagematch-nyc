import { describe, expect, it } from 'vitest';
import { walletTotals } from '@/features/payments/payment-display';
import type { Payment } from '@/data/payments';

const payments: Payment[] = ['pending', 'held', 'released', 'refunded'].map(status => ({
  status: status as Payment['status'], amount_usd: 200, fee_usd: 30, payout_usd: 170, created_at: '', updated_at: '',
}));
describe('Wallet totals', () => {
  it('counts artist released payout and held payout after the 15% fee, excluding pending and refunded', () => {
    expect(walletTotals(payments, 'artist')).toEqual({ paid: 170, held: 170, refunded: 0 });
  });
  it('counts venue held and released as paid, with separate held and refunded totals', () => {
    expect(walletTotals(payments, 'venue')).toEqual({ paid: 400, held: 200, refunded: 200 });
  });
});