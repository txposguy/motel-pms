// The cash discount fee is configured at the terminal/MID level, not here
// (PRD §6.1) — the terminal is the source of truth for the real fee. This
// only produces the *estimated* card price shown before any transaction
// has actually happened (check-in rate block, reg card, folio balance).
export function estimateCardTotal(cashAmount: number, cashDiscountPercent: number): number {
  return Math.round(cashAmount * (1 + cashDiscountPercent / 100) * 100) / 100;
}
