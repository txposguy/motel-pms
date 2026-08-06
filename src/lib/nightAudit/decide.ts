// Pure decision logic for one stay, for one night audit run. Deliberately
// separated from all the Prisma/DB work in data/nightAudit.ts — the 30-day
// exemption (PRD §7.2) is exactly the kind of edge-case-heavy rule that
// can't be verified by manually running the app (nobody is going to
// live-test 30 real nights), so it has to be provable with unit tests
// instead.

export type RatePlanUnit = "hourly" | "nightly" | "weekly";

export type StayForAudit = {
  ratePlanUnit: RatePlanUnit;
  ratePlanBaseAmount: number;
  consecutiveNightsCounter: number;
  taxExempt: boolean;
  // A room_charge folio_line already exists for today's business date —
  // true for a stay that checked in today (check-in posts night one
  // itself) or for a stay a previous, already-successful audit run today
  // already processed.
  alreadyChargedToday: boolean;
  expectedCheckOutAt: Date;
};

export type AuditDecision = {
  // Nothing to do for this stay this run — hourly (billed at check-in
  // only, PRD §4.7) or already charged for today.
  skip: boolean;
  // Post a room_charge line for ratePlanBaseAmount. Only nightly plans —
  // weekly is charged in a lump sum manually via Extend Stay, never
  // auto-billed nightly by audit (owner decision, 2026-08-06); hourly
  // never reaches here (skip is true first).
  postRoomCharge: boolean;
  // Post tax lines on top of the room charge. False whenever the stay is
  // (or is about to become, via triggersExemption) tax exempt — an exempt
  // stay's crossing night doesn't get a last dose of tax before stopping.
  postTaxLines: boolean;
  newConsecutiveNightsCounter: number;
  // This run is what pushes the stay over the exemption threshold. The
  // caller is responsible for posting the retroactive credit reversing
  // every prior tax line on the folio when this is true.
  triggersExemption: boolean;
  // Independent of everything else above — computed for every in-house
  // stay regardless of rate plan or billing state, for the audit report.
  isOverstay: boolean;
};

export function decideNightAuditAction(
  stay: StayForAudit,
  // The soonest "exempt after N consecutive nights" among the property's
  // active room-charge tax rules, or null if none configure one. A
  // property stacking multiple HOT rules (state/city/county) is expected
  // to give them the same threshold; the minimum is the safe choice if
  // they ever disagree — it can only exempt a guest sooner, never later
  // than Texas law requires.
  exemptAfterConsecutiveNights: number | null,
  now: Date
): AuditDecision {
  const isOverstay = stay.expectedCheckOutAt.getTime() < now.getTime();

  if (stay.ratePlanUnit === "hourly" || stay.alreadyChargedToday) {
    return {
      skip: true,
      postRoomCharge: false,
      postTaxLines: false,
      newConsecutiveNightsCounter: stay.consecutiveNightsCounter,
      triggersExemption: false,
      isOverstay,
    };
  }

  const newConsecutiveNightsCounter = stay.consecutiveNightsCounter + 1;
  const triggersExemption =
    !stay.taxExempt && exemptAfterConsecutiveNights !== null && newConsecutiveNightsCounter >= exemptAfterConsecutiveNights;
  const effectivelyExempt = stay.taxExempt || triggersExemption;

  return {
    skip: false,
    postRoomCharge: stay.ratePlanUnit === "nightly",
    postTaxLines: stay.ratePlanUnit === "nightly" && !effectivelyExempt,
    newConsecutiveNightsCounter,
    triggersExemption,
    isOverstay,
  };
}
