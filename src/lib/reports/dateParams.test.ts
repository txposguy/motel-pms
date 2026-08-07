import { describe, expect, it } from "vitest";
import { parseDateParam, parseBusinessDateParam, toDateInputValue, toBusinessDateInputValue } from "./dateParams";

describe("parseDateParam", () => {
  it("parses YYYY-MM-DD as local midnight", () => {
    const result = parseDateParam("2026-08-06", new Date(0));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(6);
    expect(result.getHours()).toBe(0);
  });

  it("falls back on a missing or malformed param", () => {
    const fallback = new Date(2020, 0, 1);
    expect(parseDateParam(undefined, fallback)).toBe(fallback);
    expect(parseDateParam("not-a-date", fallback)).toBe(fallback);
    expect(parseDateParam("2026-8-6", fallback)).toBe(fallback); // must be zero-padded
  });
});

describe("parseBusinessDateParam", () => {
  it("parses YYYY-MM-DD as UTC midnight, matching the business_date DB round-trip", () => {
    const result = parseBusinessDateParam("2026-08-06", new Date(0));
    expect(result.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });
});

describe("round-tripping through the input-value formatters", () => {
  it("toDateInputValue undoes parseDateParam", () => {
    const original = "2026-01-05";
    const parsed = parseDateParam(original, new Date(0));
    expect(toDateInputValue(parsed)).toBe(original);
  });

  it("toBusinessDateInputValue undoes parseBusinessDateParam", () => {
    const original = "2026-01-05";
    const parsed = parseBusinessDateParam(original, new Date(0));
    expect(toBusinessDateInputValue(parsed)).toBe(original);
  });

  it("toBusinessDateInputValue correctly formats a value read back from the DB (UTC midnight) without shifting a day", () => {
    // The exact live bug from night audit: formatting this with local
    // getters would show 2026-08-05 in any US timezone.
    const fromDb = new Date("2026-08-06T00:00:00.000Z");
    expect(toBusinessDateInputValue(fromDb)).toBe("2026-08-06");
  });
});
