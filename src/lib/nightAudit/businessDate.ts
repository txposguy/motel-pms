// A "business date" is a pure calendar date, never a timezone-sensitive
// instant — but Postgres `@db.Date` columns don't know that: they discard
// time/timezone on write, and Prisma reconstructs them as UTC midnight on
// read, REGARDLESS of what instant was originally written. A value built as
// local midnight (e.g. `new Date(now.toDateString())`, used elsewhere in
// this app before a DB round-trip) comes back from the database shifted —
// discovered live: night audit compared a freshly-built local-midnight
// "today" against folio lines just read back from Postgres and never once
// matched, even for a line posted earlier that same day, because the two
// representations differ by the server's UTC offset (5-6 hours for US
// Central). Left unfixed, that would have double-charged same-day
// check-ins for their first night, every single time.
//
// Fix: always construct and compare business dates as UTC midnight here,
// matching what the database round-trip already normalizes everything to.
// Never call `.toDateString()`/`.toLocaleDateString()` on a business date
// value directly — those read in the LOCAL timezone and, for any US
// property, will render UTC midnight as the PREVIOUS calendar day.

export function todaysBusinessDate(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function formatBusinessDate(date: Date): string {
  return date.toLocaleDateString(undefined, { timeZone: "UTC" });
}
