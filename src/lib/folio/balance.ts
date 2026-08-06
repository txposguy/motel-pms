export type PaymentForBalance = {
  status: string;
  isPreauth: boolean;
  preauthCapturedAt: Date | string | null;
  amountSettled: number | null;
};

// An approved pre-authorization only holds funds — it doesn't count as
// "paid" against the balance until it's actually captured.
//
// A refund is its own Payment row with a NEGATIVE amountSettled, linked back
// to the original via refundsPaymentId (see refundPayment in payments.ts) —
// its negative amount is what actually reverses the balance. The ORIGINAL
// payment gets relabeled status "refunded" once nothing's left owed on it,
// but that's a display label only: it must keep counting its full original
// amount here, or the reversal double-counts (the original's own amount
// disappearing from the sum, AND the refund row subtracting it again) —
// caught via a live refund test that showed a $1.08 refund raising the
// balance by $2.16 instead of $1.08.
export function computePaidAmount(payments: PaymentForBalance[]): number {
  return payments
    .filter((p) => (p.status === "approved" || p.status === "refunded") && (!p.isPreauth || p.preauthCapturedAt))
    .reduce((sum, p) => sum + (p.amountSettled ?? 0), 0);
}

export function computeBalance(charges: number, payments: PaymentForBalance[]): number {
  // Round to the cent — floating-point subtraction on dollar amounts can
  // otherwise leave noise like 29.010000000000005 in anything that displays
  // or persists this value. The underlying folio_lines/payments rows stay
  // exact regardless (Decimal columns); this only affects derived totals.
  return Math.round((charges - computePaidAmount(payments)) * 100) / 100;
}
