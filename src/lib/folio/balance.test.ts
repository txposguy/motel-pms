import { describe, expect, it } from "vitest";
import { computeBalance, computePaidAmount } from "./balance";

describe("computeBalance", () => {
  it("subtracts approved payments from charges", () => {
    expect(computeBalance(100, [{ status: "approved", isPreauth: false, preauthCapturedAt: null, amountSettled: 40 }])).toBe(60);
  });

  it("ignores declined and pending payments", () => {
    const payments = [
      { status: "declined", isPreauth: false, preauthCapturedAt: null, amountSettled: 0 },
      { status: "pending", isPreauth: false, preauthCapturedAt: null, amountSettled: null },
    ];
    expect(computeBalance(100, payments)).toBe(100);
  });

  it("excludes an uncaptured pre-authorization from paid amount", () => {
    const payments = [{ status: "approved", isPreauth: true, preauthCapturedAt: null, amountSettled: 50 }];
    expect(computeBalance(100, payments)).toBe(100);
    expect(computePaidAmount(payments)).toBe(0);
  });

  it("counts a captured pre-authorization as paid", () => {
    const payments = [{ status: "approved", isPreauth: true, preauthCapturedAt: new Date(), amountSettled: 50 }];
    expect(computeBalance(100, payments)).toBe(50);
  });

  describe("refunds", () => {
    // A full refund relabels the original "refunded" but must keep counting
    // its full amount here — only the linked negative refund row should
    // actually move the balance. A live test caught this double-counting:
    // a $1.08 refund raised the balance by $2.16 before this was fixed.
    it("a full refund nets to zero, not double the refunded amount", () => {
      const payments = [
        { status: "refunded", isPreauth: true, preauthCapturedAt: new Date(), amountSettled: 108 },
        { status: "approved", isPreauth: false, preauthCapturedAt: null, amountSettled: -108 },
      ];
      expect(computePaidAmount(payments)).toBe(0);
      expect(computeBalance(100, payments)).toBe(100);
    });

    it("a partial refund reduces paid by only the refunded amount", () => {
      const payments = [
        { status: "approved", isPreauth: false, preauthCapturedAt: null, amountSettled: 100 },
        { status: "approved", isPreauth: false, preauthCapturedAt: null, amountSettled: -30 },
      ];
      expect(computePaidAmount(payments)).toBe(70);
    });
  });

  it("rounds away floating-point noise", () => {
    // 123.45 - (65 + 3.90 + 4.55 + 20.99 + 20.99 + 7.99) style accumulation
    // is exactly the kind of subtraction that leaves 29.010000000000005.
    const charges = 65 + 3.9 + 4.55 + 50;
    const payments = [
      { status: "approved" as const, isPreauth: false, preauthCapturedAt: null, amountSettled: 73.45 },
      { status: "approved" as const, isPreauth: false, preauthCapturedAt: null, amountSettled: 20.99 },
    ];
    const balance = computeBalance(charges, payments);
    expect(balance).toBe(29.01);
    expect(Number.isInteger(balance * 100)).toBe(true);
  });
});
