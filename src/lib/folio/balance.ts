export type PaymentForBalance = {
  status: string;
  isPreauth: boolean;
  preauthCapturedAt: Date | string | null;
  amountSettled: number | null;
};

// An approved pre-authorization only holds funds — it doesn't count as
// "paid" against the balance until it's actually captured.
export function computePaidAmount(payments: PaymentForBalance[]): number {
  return payments
    .filter((p) => p.status === "approved" && (!p.isPreauth || p.preauthCapturedAt))
    .reduce((sum, p) => sum + (p.amountSettled ?? 0), 0);
}

export function computeBalance(charges: number, payments: PaymentForBalance[]): number {
  // Round to the cent — floating-point subtraction on dollar amounts can
  // otherwise leave noise like 29.010000000000005 in anything that displays
  // or persists this value. The underlying folio_lines/payments rows stay
  // exact regardless (Decimal columns); this only affects derived totals.
  return Math.round((charges - computePaidAmount(payments)) * 100) / 100;
}
