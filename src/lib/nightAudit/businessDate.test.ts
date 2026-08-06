import { describe, expect, it } from "vitest";
import { todaysBusinessDate, formatBusinessDate } from "./businessDate";

describe("todaysBusinessDate", () => {
  it("builds exact UTC midnight for the local calendar date, regardless of local time-of-day", () => {
    // 11:36 PM local — late enough that a naive UTC-based "today" could
    // roll over to the wrong day if this used now.getUTCDate() instead of
    // the local getters.
    const now = new Date(2026, 7, 6, 23, 36, 0); // August 6, 2026, local time
    const result = todaysBusinessDate(now);
    expect(result.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("matches what a Postgres DATE column round-trip produces", () => {
    // Empirically confirmed live: writing any Date for calendar date
    // 2026-08-06 to a @db.Date column and reading it back always yields
    // 2026-08-06T00:00:00.000Z — this must equal that exactly, or
    // "already posted today" comparisons against DB-read folio_lines will
    // never match.
    const now = new Date(2026, 7, 6, 9, 0, 0);
    expect(todaysBusinessDate(now).getTime()).toBe(new Date("2026-08-06T00:00:00.000Z").getTime());
  });
});

describe("formatBusinessDate", () => {
  it("renders a UTC-midnight business date as its own calendar day, not the day before", () => {
    // This is the exact live bug: toLocaleDateString() without timeZone:
    // "UTC" reads 2026-08-06T00:00:00Z in the local zone, and in any US
    // timezone that's the evening of August 5th.
    const businessDate = new Date("2026-08-06T00:00:00.000Z");
    expect(formatBusinessDate(businessDate)).toBe("8/6/2026");
  });
});
