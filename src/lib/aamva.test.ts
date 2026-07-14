import { describe, expect, it } from "vitest";
import { parseAAMVA, looksLikeAAMVA } from "./aamva";

// Synthetic fixtures built to match real AAMVA DL/ID payload structure
// (compliance indicator, ANSI header, subfile + element codes). Names and
// numbers are fabricated, not real scanned data — swap in real (anonymized)
// scans from the field once the pilot property is running slice 3.

const TEXAS_MMDDCCYY =
  "@\n\rANSI 636015090002DL00410278ZT02320258DLDAQ12345678\n" +
  "DCSSAMPLE\nDACJOHN\nDADQUINCY\nDBD01152020\nDBB04121985\nDBA04122030\n" +
  "DBC1\nDAU069 IN\nDAYBRO\nDAG123 MAIN ST\nDAIHOUSTON\nDAJTX\nDAK770010000  \n" +
  "DCGUSA\nDDEN\nDDFN\nDDGN\n";

const CALIFORNIA_CRLF =
  "@\r\n\rANSI 636014090002DL00410278ZC03190008DLDAQD1234567\r\n" +
  "DCSDRIVER\r\nDACJANE\r\nDADMARIE\r\nDBB09231990\r\nDBA09232028\r\nDBC2\r\n" +
  "DAG456 OAK AVE\r\nDAILOS ANGELES\r\nDAJCA\r\nDAK900010000  \r\nDCGUSA\r\n";

// Older-style payload using CCYYMMDD instead of MMDDCCYY.
const LEGACY_CCYYMMDD =
  "@\n\rANSI 636001090002DL00410278ZNL0100010DLDAQ998877\n" +
  "DCSOLDER\nDACPAT\nDBB19700615\nDBA20260615\nDAG1 ELM ST\nDAISPRINGFIELD\nDAJNY\nDAK100010000\nDCGUSA\n";

// No separators at all between elements (worst-case truncated scan).
const RUN_TOGETHER = "DCSNOSEPDACLEEDBB01011999DBA01012030DAQ555555";

const MISSING_FIELDS =
  "@\n\rANSI 636015090002DL00410278ZT02320258DLDAQ87654321\nDCSPARTIAL\nDACSAM\n";

describe("parseAAMVA", () => {
  it("parses a standard MMDDCCYY payload (Texas)", () => {
    const result = parseAAMVA(TEXAS_MMDDCCYY);
    expect(result.firstName).toBe("JOHN");
    expect(result.middleName).toBe("QUINCY");
    expect(result.lastName).toBe("SAMPLE");
    expect(result.addressLine1).toBe("123 MAIN ST");
    expect(result.city).toBe("HOUSTON");
    expect(result.state).toBe("TX");
    expect(result.zip).toBe("770010000");
    expect(result.dob).toBe("1985-04-12");
    expect(result.idNumber).toBe("12345678");
    expect(result.idExpiration).toBe("2030-04-12");
    expect(result.sex).toBe("1");
    expect(result.country).toBe("USA");
    expect(result.warnings).toHaveLength(0);
  });

  it("parses a payload using CRLF separators (California)", () => {
    const result = parseAAMVA(CALIFORNIA_CRLF);
    expect(result.firstName).toBe("JANE");
    expect(result.lastName).toBe("DRIVER");
    expect(result.state).toBe("CA");
    expect(result.idNumber).toBe("D1234567");
    expect(result.dob).toBe("1990-09-23");
    expect(result.idExpiration).toBe("2028-09-23");
  });

  it("falls back to CCYYMMDD when MMDDCCYY is structurally invalid", () => {
    const result = parseAAMVA(LEGACY_CCYYMMDD);
    expect(result.dob).toBe("1970-06-15");
    expect(result.idExpiration).toBe("2026-06-15");
    expect(result.idNumber).toBe("998877");
  });

  it("recovers fields from a run-together payload with no separators", () => {
    const result = parseAAMVA(RUN_TOGETHER);
    expect(result.lastName).toBe("NOSEP");
    expect(result.firstName).toBe("LEE");
    expect(result.dob).toBe("1999-01-01");
    expect(result.idExpiration).toBe("2030-01-01");
    expect(result.idNumber).toBe("555555");
  });

  it("returns partial data and no throw when fields are missing", () => {
    const result = parseAAMVA(MISSING_FIELDS);
    expect(result.firstName).toBe("SAM");
    expect(result.lastName).toBe("PARTIAL");
    expect(result.idNumber).toBe("87654321");
    expect(result.dob).toBeNull();
    expect(result.city).toBeNull();
  });

  it("never throws on empty input", () => {
    expect(() => parseAAMVA("")).not.toThrow();
    const result = parseAAMVA("");
    expect(result.firstName).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("never throws on random garbage", () => {
    const garbage = "\x00\x01\x02%%%##@@@@" + "x".repeat(500) + "��";
    expect(() => parseAAMVA(garbage)).not.toThrow();
    expect(parseAAMVA(garbage).firstName).toBeNull();
  });

  it("never throws on a huge random binary-ish string", () => {
    const bytes = Array.from({ length: 2000 }, (_, i) => String.fromCharCode(i % 256)).join("");
    expect(() => parseAAMVA(bytes)).not.toThrow();
  });

  it("does not misparse an 8-digit value that is invalid in both date formats", () => {
    const badDate = "DCSX\nDACY\nDBB99999999\nDAQ1\n";
    const result = parseAAMVA(badDate);
    expect(result.dob).toBeNull();
    expect(result.warnings).toContain("Could not parse date of birth.");
  });
});

describe("looksLikeAAMVA", () => {
  it("recognizes a real payload prefix", () => {
    expect(looksLikeAAMVA(TEXAS_MMDDCCYY)).toBe(true);
  });

  it("rejects short manual typing", () => {
    expect(looksLikeAAMVA("ANSI ")).toBe(false);
    expect(looksLikeAAMVA("John Smith")).toBe(false);
  });
});
