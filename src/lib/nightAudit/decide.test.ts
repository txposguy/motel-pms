import { describe, expect, it } from "vitest";
import { decideNightAuditAction, type StayForAudit } from "./decide";

const now = new Date("2026-08-06T23:30:00");

function stay(overrides: Partial<StayForAudit> = {}): StayForAudit {
  return {
    ratePlanUnit: "nightly",
    ratePlanBaseAmount: 65,
    consecutiveNightsCounter: 5,
    taxExempt: false,
    alreadyChargedToday: false,
    expectedCheckOutAt: new Date("2026-08-10T11:00:00"),
    ...overrides,
  };
}

describe("decideNightAuditAction", () => {
  it("skips hourly stays entirely — billed at check-in, not by audit", () => {
    const result = decideNightAuditAction(stay({ ratePlanUnit: "hourly" }), 30, now);
    expect(result.skip).toBe(true);
    expect(result.postRoomCharge).toBe(false);
    expect(result.newConsecutiveNightsCounter).toBe(5);
  });

  it("skips a stay already charged for today — same-day check-in already posted night one", () => {
    const result = decideNightAuditAction(stay({ alreadyChargedToday: true }), 30, now);
    expect(result.skip).toBe(true);
    expect(result.newConsecutiveNightsCounter).toBe(5);
  });

  it("a normal nightly stay gets a room charge, tax, and its counter bumped", () => {
    const result = decideNightAuditAction(stay(), 30, now);
    expect(result.skip).toBe(false);
    expect(result.postRoomCharge).toBe(true);
    expect(result.postTaxLines).toBe(true);
    expect(result.newConsecutiveNightsCounter).toBe(6);
    expect(result.triggersExemption).toBe(false);
  });

  it("a weekly stay only gets its counter bumped — no auto-billed room charge", () => {
    const result = decideNightAuditAction(stay({ ratePlanUnit: "weekly" }), 30, now);
    expect(result.skip).toBe(false);
    expect(result.postRoomCharge).toBe(false);
    expect(result.postTaxLines).toBe(false);
    expect(result.newConsecutiveNightsCounter).toBe(6);
  });

  it("a weekly stay still accrues toward the 30-day exemption even though it isn't billed nightly", () => {
    const result = decideNightAuditAction(stay({ ratePlanUnit: "weekly", consecutiveNightsCounter: 29 }), 30, now);
    expect(result.triggersExemption).toBe(true);
  });

  it("the night that crosses the threshold triggers exemption and does NOT get taxed", () => {
    const result = decideNightAuditAction(stay({ consecutiveNightsCounter: 29 }), 30, now);
    expect(result.newConsecutiveNightsCounter).toBe(30);
    expect(result.triggersExemption).toBe(true);
    expect(result.postRoomCharge).toBe(true); // the room charge itself still posts
    expect(result.postTaxLines).toBe(false); // just not the tax on top of it
  });

  it("a stay already exempt from a prior run keeps posting room charges but never tax, and never re-triggers", () => {
    const result = decideNightAuditAction(stay({ taxExempt: true, consecutiveNightsCounter: 45 }), 30, now);
    expect(result.postRoomCharge).toBe(true);
    expect(result.postTaxLines).toBe(false);
    expect(result.triggersExemption).toBe(false);
  });

  it("no exemption rule configured (null threshold) never triggers, regardless of counter", () => {
    const result = decideNightAuditAction(stay({ consecutiveNightsCounter: 500 }), null, now);
    expect(result.triggersExemption).toBe(false);
    expect(result.postTaxLines).toBe(true);
  });

  it("a jump past the threshold in one run (e.g. a manual counter correction) still triggers, not just an exact match", () => {
    const result = decideNightAuditAction(stay({ consecutiveNightsCounter: 35 }), 30, now);
    expect(result.newConsecutiveNightsCounter).toBe(36);
    expect(result.triggersExemption).toBe(true);
  });

  it("flags an overstay independent of skip/charge state", () => {
    const overdue = stay({ expectedCheckOutAt: new Date("2026-08-05T11:00:00"), alreadyChargedToday: true });
    const result = decideNightAuditAction(overdue, 30, now);
    expect(result.skip).toBe(true);
    expect(result.isOverstay).toBe(true);
  });

  it("does not flag a stay whose expected check-out is still in the future", () => {
    const result = decideNightAuditAction(stay(), 30, now);
    expect(result.isOverstay).toBe(false);
  });
});
