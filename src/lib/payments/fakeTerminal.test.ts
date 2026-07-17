import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTerminal } from "./fakeTerminal";

describe("FakeTerminal", () => {
  let terminal: FakeTerminal;

  beforeEach(() => {
    vi.useFakeTimers();
    terminal = new FakeTerminal();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("approves a normal amount", async () => {
    const promise = terminal.sale({ amountCents: 7345, invoiceNumber: "folio-1" });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.status).toBe("approved");
    expect(result.amountSettled).toBe(7345);
    expect(result.transactionId).toBeTruthy();
    expect(result.maskedPan).toMatch(/^\*+\d{4}$/);
  });

  it("declines an amount ending in .13", async () => {
    const promise = terminal.sale({ amountCents: 1013, invoiceNumber: "folio-2" });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.status).toBe("declined");
    expect(result.amountSettled).toBe(0);
  });

  it("times out on an amount ending in .99, then resolves to approved via status()", async () => {
    const invoiceNumber = "folio-3";
    const salePromise = terminal.sale({ amountCents: 2599, invoiceNumber });
    await vi.advanceTimersByTimeAsync(3000);
    const saleResult = await salePromise;
    expect(saleResult.status).toBe("timeout");

    // Immediately after the sale() timeout, the terminal hasn't actually
    // settled yet either — reconciling too early should also say "unknown".
    const tooEarly = await terminal.status(invoiceNumber);
    expect(tooEarly.status).toBe("timeout");

    // After it actually settles at the terminal, reconciling finds it.
    await vi.advanceTimersByTimeAsync(2000);
    const resolved = await terminal.status(invoiceNumber);
    expect(resolved.status).toBe("approved");
    expect(resolved.amountSettled).toBe(2599);
  });

  it("status() on an unknown invoice number returns error, not a false positive", async () => {
    const result = await terminal.status("never-existed");
    expect(result.status).toBe("error");
  });

  it("status() only resolves a pending transaction once — a second reconcile finds nothing", async () => {
    const invoiceNumber = "folio-4";
    const salePromise = terminal.sale({ amountCents: 5099, invoiceNumber });
    await vi.advanceTimersByTimeAsync(3000);
    await salePromise;
    await vi.advanceTimersByTimeAsync(2000);

    const first = await terminal.status(invoiceNumber);
    expect(first.status).toBe("approved");

    const second = await terminal.status(invoiceNumber);
    expect(second.status).toBe("error");
  });

  it("void returns a voided status", async () => {
    const promise = terminal.void({ transactionId: "FAKE-123" });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.status).toBe("voided");
  });

  it("ping always resolves true", async () => {
    expect(await terminal.ping()).toBe(true);
  });
});
