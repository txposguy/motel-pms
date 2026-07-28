import { describe, expect, it } from "vitest";
import { estimateCardTotal } from "./cashDiscount";

describe("estimateCardTotal", () => {
  it("adds the percent on top of the cash amount", () => {
    expect(estimateCardTotal(100, 3.5)).toBe(103.5);
  });

  it("returns the same amount at 0%", () => {
    expect(estimateCardTotal(100, 0)).toBe(100);
  });

  it("rounds to the cent", () => {
    expect(estimateCardTotal(33.33, 3.5)).toBe(34.5);
  });
});
