// Reports take dates from URL query params (?date=, ?from=, ?to=) as plain
// "YYYY-MM-DD" strings. Two different downstream uses need two different
// constructions — mixing them up is exactly the bug night audit hit (see
// nightAudit/businessDate.ts):
//
// - Filtering a real timestamp column (created_at, checked_in_at,
//   completed_at) wants LOCAL calendar-day boundaries — use the
//   `*DateParam` functions.
// - Filtering/matching a `@db.Date` business_date column wants UTC midnight,
//   because that's what Postgres always round-trips a DATE column to,
//   regardless of how it was written — use the `*BusinessDateParam`
//   functions, and see nightAudit/businessDate.ts for why.

function parseParts(param: string | undefined): [number, number, number] | null {
  if (!param) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function parseDateParam(param: string | undefined, fallback: Date): Date {
  const parts = parseParts(param);
  if (!parts) return fallback;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

export function parseBusinessDateParam(param: string | undefined, fallback: Date): Date {
  const parts = parseParts(param);
  if (!parts) return fallback;
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d));
}

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toBusinessDateInputValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
