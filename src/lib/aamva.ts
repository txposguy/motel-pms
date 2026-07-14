// Parses the AAMVA DL/ID barcode payload from a PDF417 scan (keyboard-wedge
// scanner input). Must never throw — malformed, truncated, or garbage input
// should always return a partial/empty result so the clerk can fill gaps by
// hand. See PRD.md §4.3.

export type ParsedAAMVA = {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  dob: string | null; // ISO yyyy-mm-dd
  idNumber: string | null;
  idExpiration: string | null; // ISO yyyy-mm-dd
  sex: string | null;
  country: string | null;
  raw: string;
  warnings: string[];
};

const EMPTY_RESULT: Omit<ParsedAAMVA, "raw" | "warnings"> = {
  firstName: null,
  middleName: null,
  lastName: null,
  addressLine1: null,
  city: null,
  state: null,
  zip: null,
  dob: null,
  idNumber: null,
  idExpiration: null,
  sex: null,
  country: null,
};

// The element codes we care about, plus a few common ones that don't map to
// any field — they're listed anyway so they act as segment boundaries when
// re-delimiting a run-together or truncated payload (see segmentElements).
const KNOWN_CODES = [
  "DCS", "DAC", "DAD", "DAG", "DAI", "DAJ", "DAK", "DBB", "DAQ", "DBA", "DBC", "DCG",
  "DBD", "DAU", "DAY", "DCF", "DAW", "DCK", "DDE", "DDF", "DDG", "DCA", "DCB", "DCD", "DCH", "DCE", "DDA",
];

function segmentElements(raw: string): Record<string, string> {
  // Real scans separate elements with CR/LF, but truncated or malformed
  // payloads sometimes run elements together with no separator at all. We
  // force a boundary in front of every known code first, so both cases end
  // up split the same way.
  const boundary = new RegExp(`(${KNOWN_CODES.join("|")})`, "g");
  const withBreaks = raw.replace(boundary, "\n$1");
  const lines = withBreaks.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  const result: Record<string, string> = {};
  for (const line of lines) {
    const code = line.slice(0, 3);
    if (!KNOWN_CODES.includes(code)) continue;
    const value = line.slice(3).trim();
    if (value && !(code in result)) result[code] = value;
  }
  return result;
}

function isValidDate(month: number, day: number, year: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

function toISO(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// AAMVA date format varies by jurisdiction (MMDDCCYY vs CCYYMMDD) and the
// spec says to infer it from the issuing state / version header. Rather than
// maintain a jurisdiction table, we try the modern standard (MMDDCCYY) first
// and only fall back to CCYYMMDD if that's structurally invalid.
function parseAAMVADate(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const mm = Number(digits.slice(0, 2));
  const dd = Number(digits.slice(2, 4));
  const ccyy = Number(digits.slice(4, 8));
  if (isValidDate(mm, dd, ccyy)) return toISO(ccyy, mm, dd);

  const ccyy2 = Number(digits.slice(0, 4));
  const mm2 = Number(digits.slice(4, 6));
  const dd2 = Number(digits.slice(6, 8));
  if (isValidDate(mm2, dd2, ccyy2)) return toISO(ccyy2, mm2, dd2);

  return null;
}

export function parseAAMVA(raw: string): ParsedAAMVA {
  try {
    const elements = segmentElements(raw);
    const warnings: string[] = [];

    const dob = parseAAMVADate(elements.DBB);
    if (elements.DBB && !dob) warnings.push("Could not parse date of birth.");

    const idExpiration = parseAAMVADate(elements.DBA);
    if (elements.DBA && !idExpiration) warnings.push("Could not parse ID expiration date.");

    if (Object.keys(elements).length === 0) warnings.push("No recognizable AAMVA fields found.");

    return {
      firstName: elements.DAC ?? null,
      middleName: elements.DAD ?? null,
      lastName: elements.DCS ?? null,
      addressLine1: elements.DAG ?? null,
      city: elements.DAI ?? null,
      state: elements.DAJ ?? null,
      zip: elements.DAK ? elements.DAK.replace(/\s+$/, "") : null,
      dob,
      idNumber: elements.DAQ ?? null,
      idExpiration,
      sex: elements.DBC ?? null,
      country: elements.DCG ?? null,
      raw,
      warnings,
    };
  } catch {
    return { ...EMPTY_RESULT, raw, warnings: ["Failed to parse barcode data."] };
  }
}

// A quick, cheap check for "does this look like an AAMVA payload yet" — used
// by the scan strip to decide when to trigger a parse, without needing to
// wait for the scanner's terminating keystroke.
export function looksLikeAAMVA(value: string): boolean {
  return value.includes("ANSI ") && value.length > 40;
}
