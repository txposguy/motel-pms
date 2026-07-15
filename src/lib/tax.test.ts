import { describe, expect, it } from "vitest";
import { calculateTax } from "./tax";

const STATE_HOT = { id: "state", name: "TX State Hotel Occupancy Tax", ratePercent: 6, appliesTo: "room_charge" as const };
const CITY_HOT = { id: "city", name: "Local Hotel Occupancy Tax", ratePercent: 7, appliesTo: "room_charge" as const };
const INCIDENTAL_TAX = { id: "inc", name: "Incidental Tax", ratePercent: 8.25, appliesTo: "incidental" as const };

describe("calculateTax", () => {
  it("computes a single tax rule", () => {
    const result = calculateTax(65, [STATE_HOT], "room_charge");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(3.9);
    expect(result[0].taxRuleId).toBe("state");
  });

  it("stacks multiple tax rules as separate lines", () => {
    const result = calculateTax(65, [STATE_HOT, CITY_HOT], "room_charge");
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe(3.9);
    expect(result[1].amount).toBe(4.55);
  });

  it("filters by appliesTo — room_charge rules don't apply to incidentals", () => {
    const result = calculateTax(10, [STATE_HOT, CITY_HOT], "incidental");
    expect(result).toHaveLength(0);
  });

  it("filters by appliesTo — incidental rules don't apply to room charges", () => {
    const result = calculateTax(65, [INCIDENTAL_TAX], "room_charge");
    expect(result).toHaveLength(0);
  });

  it("returns an empty array when no tax rules are configured", () => {
    expect(calculateTax(65, [], "room_charge")).toEqual([]);
  });

  it("rounds to the cent", () => {
    const oddRate = { id: "odd", name: "Odd Rate", ratePercent: 6.123, appliesTo: "room_charge" as const };
    const result = calculateTax(33.33, [oddRate], "room_charge");
    expect(result[0].amount).toBe(2.04);
  });
});
