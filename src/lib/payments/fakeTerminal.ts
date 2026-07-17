import type {
  BatchResult,
  CaptureRequest,
  PaymentTerminal,
  PreAuthRequest,
  RefundRequest,
  SaleRequest,
  TxnResult,
  VoidRequest,
} from "./terminal";

// Dev/demo stand-in for a real Valor Connect (or Dejavoo) adapter — see the
// project README for why. Exercises the exact same PaymentTerminal contract
// the real adapter will implement, so swapping it in later (once there's a
// demo terminal + the ValorPay POS Integration Specification in hand)
// requires no changes anywhere else in the app.
//
// Simulated outcomes are triggered by the cents portion of the amount, a
// common sandbox convention (cf. Stripe's magic test card numbers):
//   ...13 → declined
//   ...99 → timeout — the "terminal" actually approves a few seconds later,
//           but the sale() call itself never hears back. This is exactly
//           the double-charge trap the RECONCILE flow (CLAUDE.md rule #8)
//           exists to prevent: never auto-retry, resolve via status().
//   anything else → approved

const APPROVE_DELAY_MS = 800;
const DECLINE_DELAY_MS = 600;
const TIMEOUT_GIVEUP_MS = 2500;
const TIMEOUT_SETTLES_AT_MS = 4000;

type PendingTxn = { resolvesAt: number; result: TxnResult };

// Keyed by invoiceNumber (= folio id), not a provider transactionId — a true
// timeout means we never received one. Module-level so it survives across
// requests within one running server process; a real adapter's equivalent
// would be the provider's own reconciliation records, not in-memory state.
const pendingByInvoice = new Map<string, PendingTxn>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeTxnId() {
  return `FAKE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fakeAuthCode() {
  return Math.random().toString().slice(2, 8);
}

function fakeRrn() {
  return Math.random().toString().slice(2, 14);
}

const FAKE_MASKED_PAN = "************4242";

export class FakeTerminal implements PaymentTerminal {
  async ping(): Promise<boolean> {
    return true;
  }

  async sale(req: SaleRequest): Promise<TxnResult> {
    const lastTwoCents = req.amountCents % 100;

    if (lastTwoCents === 13) {
      await delay(DECLINE_DELAY_MS);
      return {
        status: "declined",
        amountSettled: 0,
        transactionId: fakeTxnId(),
        raw: { simulated: true, reason: "insufficient_funds" },
      };
    }

    if (lastTwoCents === 99) {
      const transactionId = fakeTxnId();
      const approvedResult: TxnResult = {
        status: "approved",
        amountSettled: req.amountCents,
        authCode: fakeAuthCode(),
        rrn: fakeRrn(),
        transactionId,
        maskedPan: FAKE_MASKED_PAN,
        cardBrand: "visa",
        entryMode: "chip",
        raw: { simulated: true, note: "approved at the terminal after the PMS gave up waiting" },
      };
      pendingByInvoice.set(req.invoiceNumber, { resolvesAt: Date.now() + TIMEOUT_SETTLES_AT_MS, result: approvedResult });

      await delay(TIMEOUT_GIVEUP_MS);
      return {
        status: "timeout",
        amountSettled: 0,
        transactionId: "",
        raw: { simulated: true, note: "no response received from terminal" },
      };
    }

    await delay(APPROVE_DELAY_MS);
    return {
      status: "approved",
      amountSettled: req.amountCents,
      authCode: fakeAuthCode(),
      rrn: fakeRrn(),
      transactionId: fakeTxnId(),
      maskedPan: FAKE_MASKED_PAN,
      cardBrand: "visa",
      entryMode: "chip",
      raw: { simulated: true },
    };
  }

  async preAuth(req: PreAuthRequest): Promise<TxnResult> {
    await delay(APPROVE_DELAY_MS);
    return {
      status: "approved",
      amountSettled: req.amountCents,
      authCode: fakeAuthCode(),
      transactionId: fakeTxnId(),
      maskedPan: FAKE_MASKED_PAN,
      cardBrand: "visa",
      entryMode: "chip",
      raw: { simulated: true, preAuth: true },
    };
  }

  async capture(req: CaptureRequest): Promise<TxnResult> {
    await delay(400);
    return {
      status: "approved",
      amountSettled: req.amountCents,
      transactionId: req.transactionId,
      raw: { simulated: true, captured: true },
    };
  }

  async void(req: VoidRequest): Promise<TxnResult> {
    await delay(400);
    return {
      status: "voided",
      amountSettled: 0,
      transactionId: req.transactionId,
      raw: { simulated: true },
    };
  }

  async refund(req: RefundRequest): Promise<TxnResult> {
    await delay(500);
    return {
      status: "approved",
      amountSettled: req.amountCents,
      transactionId: req.transactionId,
      raw: { simulated: true, refunded: true },
    };
  }

  // `txnId` here is the invoiceNumber a sale() call was made with — see the
  // note on pendingByInvoice above for why.
  async status(txnId: string): Promise<TxnResult> {
    const pending = pendingByInvoice.get(txnId);
    if (!pending) {
      return {
        status: "error",
        amountSettled: 0,
        transactionId: txnId,
        raw: { simulated: true, note: "no record of this transaction" },
      };
    }
    if (Date.now() < pending.resolvesAt) {
      return {
        status: "timeout",
        amountSettled: 0,
        transactionId: txnId,
        raw: { simulated: true, note: "still not settled at the terminal — try again shortly" },
      };
    }
    pendingByInvoice.delete(txnId);
    return pending.result;
  }

  async settle(): Promise<BatchResult> {
    await delay(500);
    return {
      batchId: fakeTxnId(),
      totalCount: 0,
      totalAmountCents: 0,
      raw: { simulated: true },
    };
  }
}

export const fakeTerminal = new FakeTerminal();
