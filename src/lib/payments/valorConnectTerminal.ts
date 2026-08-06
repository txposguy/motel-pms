import type {
  BatchResult,
  CaptureRequest,
  PaymentTerminal,
  PreAuthRequest,
  RefundRequest,
  SaleRequest,
  TxnResult,
  TxnStatus,
  VoidRequest,
} from "./terminal";

// Real Valor Connect (Cloud mode) adapter — VL100 Pro, UAT/demo terminal.
//
// CONFIRMED LIVE against Valor's staging API (securelink-staging), with the
// real credentials, before this file was trusted:
//   - auth (appid/appkey/epi/channel_id) is accepted
//   - the endpoint is a SINGLE URL — the "?status" / "?txn_status" / "?cancel"
//     suffixes shown in Valor's docs are cosmetic; routing is entirely by the
//     `txn_type` field in the JSON body (verified: identical payload behaves
//     identically regardless of query suffix, including no suffix at all)
//   - status() (txn_type "vc_status") round-trips correctly
//   - sale()/preAuth() request shape matches Valor's documented schema
//   - capture()/void() confirmed live — both need the original transaction's
//     TRAN_NO (see providerRef on CaptureRequest/VoidRequest) in addition to
//     the amount; amount 0 is rejected
//   - refund() confirmed live — unlike capture/void, no TRAN_NO/providerRef
//     was needed; REQ_TXN_ID + amount + TRAN_MODE "credit" was enough to
//     refund a previously-captured transaction back to the card
//
// NOT YET LIVE-VERIFIED: settle(). Built from the TRAN_CODE/TRAN_MODE
// reference tables provided by the ISV team (Settlement=9, TRAN_MODE "0" =
// "FETCH TRANSACTION") but never called against the real terminal — it's
// also not wired into any UI/business-logic path yet.

const BASE_URL = "https://securelink-staging.valorpaytech.com:443/";
const REQUEST_TIMEOUT_MS = 90_000; // generous — a card tap/dip/swipe needs real time

const TRAN_CODE = {
  sale: "1",
  void: "2",
  preauth: "3",
  ticket: "4", // capture/completion
  refund: "5",
  settlement: "9",
} as const;

const TRAN_MODE = {
  credit: "1",
  fetchTransaction: "0", // void, ticket, settlement, tip adjust, reprint, reports
} as const;

type ValorEnvelope = {
  error_no: string;
  mesg?: string;
  msg?: string;
  desc?: string;
  response?: Record<string, unknown> | string;
};

function getCredentials() {
  const appid = process.env.VALOR_APP_ID;
  const appkey = process.env.VALOR_APP_KEY;
  const epi = process.env.VALOR_EPI;
  const channelId = process.env.VALOR_CHANNEL_ID;
  if (!appid || !appkey || !epi || !channelId) {
    throw new Error("Valor Connect credentials are not configured (VALOR_APP_ID/APP_KEY/EPI/CHANNEL_ID).");
  }
  return { appid, appkey, epi, channelId };
}

// A network-level failure or our own timeout — genuinely "unknown", not a
// terminal-issued decline. Never auto-retry on this (CLAUDE.md rule #8).
class ValorTimeoutError extends Error {}

async function callValor(body: Record<string, unknown>): Promise<ValorEnvelope> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as ValorEnvelope;
    } catch {
      throw new Error(`Non-JSON response from Valor Connect: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ValorTimeoutError("Valor Connect did not respond in time.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function mapState(state: unknown): TxnStatus {
  if (state === "0") return "approved";
  if (state === "-1") return "declined"; // cancelled/timed out at the terminal itself
  return "error";
}

function fieldStr(r: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = r[key];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

// PRD §5.2 says always persist the raw response (needed for dispute
// resolution), but CLAUDE.md rule #1 is stricter: never store card data
// beyond tokens/masked info. A live test surfaced the terminal's response
// includes the cardholder's full name and expiry date — neither is used
// anywhere in this app, so keep them out of what we persist rather than
// storing them just because they arrived in the payload.
const REDACT_FIELDS = ["CARDHOLDER_NAME", "EXPIRY_DATE"];

function redact(envelope: ValorEnvelope): ValorEnvelope {
  if (typeof envelope.response !== "object" || !envelope.response) return envelope;
  const response = { ...(envelope.response as Record<string, unknown>) };
  for (const field of REDACT_FIELDS) delete response[field];
  return { ...envelope, response };
}

function buildResult(envelope: ValorEnvelope, requestedAmountCents: number): TxnResult {
  const raw = redact(envelope);

  if (envelope.error_no !== "S00" || typeof envelope.response !== "object" || !envelope.response) {
    return {
      status: "error",
      amountSettled: 0,
      transactionId: "",
      raw,
    };
  }

  const r = envelope.response as Record<string, unknown>;
  const totalAmount = r.TOTAL_AMOUNT !== undefined ? Number(r.TOTAL_AMOUNT) : requestedAmountCents;

  return {
    status: mapState(r.STATE),
    amountSettled: Number.isFinite(totalAmount) ? totalAmount : requestedAmountCents,
    feeApplied: totalAmount > requestedAmountCents ? totalAmount - requestedAmountCents : undefined,
    authCode: fieldStr(r, "CODE", "AUTH_CODE"),
    rrn: fieldStr(r, "RRN"),
    // Prefer our own merchant-assigned id (echoed back) — it's the one
    // reference we know we can reuse for a later status/void/capture call.
    transactionId: fieldStr(r, "MER_TXN_ID", "SERIAL_NO", "TXN_ID") ?? "",
    maskedPan: fieldStr(r, "MASKED_PAN"),
    cardBrand: fieldStr(r, "ISSUER", "CARD_BRAND"),
    entryMode: fieldStr(r, "ENTRY_MODE"),
    raw,
  };
}

async function publish(
  reqTxnId: string,
  tranCode: string,
  tranMode: string,
  amountCents: number,
  extra?: Record<string, unknown>
): Promise<TxnResult> {
  const { appid, appkey, epi, channelId } = getCredentials();
  try {
    const envelope = await callValor({
      appid,
      appkey,
      epi,
      channel_id: channelId,
      txn_type: "vc_publish",
      version: "1",
      payload: {
        TRAN_MODE: tranMode,
        TRAN_CODE: tranCode,
        AMOUNT: String(amountCents),
        REQ_TXN_ID: reqTxnId,
        ...extra,
      },
    });
    return buildResult(envelope, amountCents);
  } catch (err) {
    if (err instanceof ValorTimeoutError) {
      return { status: "timeout", amountSettled: 0, transactionId: "", raw: { error: err.message } };
    }
    throw err;
  }
}

export class ValorConnectTerminal implements PaymentTerminal {
  async ping(): Promise<boolean> {
    // No dedicated ping endpoint found in Valor's docs — a status lookup on
    // a nonexistent transaction ID gets a real (non-network-error) response
    // back if the service and credentials are reachable, which is enough
    // to answer "is the connection up," if never enough to answer "did a
    // specific transaction happen."
    try {
      const { appid, appkey, epi } = getCredentials();
      const envelope = await callValor({ appid, appkey, epi, txn_type: "vc_status", req_txn_id: "ping" });
      return typeof envelope.error_no === "string";
    } catch {
      return false;
    }
  }

  async sale(req: SaleRequest): Promise<TxnResult> {
    return publish(req.invoiceNumber, TRAN_CODE.sale, TRAN_MODE.credit, req.amountCents);
  }

  async preAuth(req: PreAuthRequest): Promise<TxnResult> {
    return publish(req.invoiceNumber, TRAN_CODE.preauth, TRAN_MODE.credit, req.amountCents);
  }

  // Live-tested end to end — same TRAN_MODE family as void() below, and
  // needs the same TRAN_NO (providerRef) to identify the original transaction.
  async capture(req: CaptureRequest): Promise<TxnResult> {
    return publish(req.transactionId, TRAN_CODE.ticket, TRAN_MODE.fetchTransaction, req.amountCents, {
      ...(req.providerRef ? { TRAN_NO: req.providerRef } : {}),
    });
  }

  // Live-tested end to end against a real approved sale. Two things
  // discovered along the way that aren't in Valor's docs:
  //   - amount 0 is rejected ("Invalid Amount") — must send the original
  //     transaction's amount.
  //   - REQ_TXN_ID + amount alone aren't enough to identify the
  //     transaction ("Tran/Card Number/Transaction ID is Empty") — the
  //     original sale's TRAN_NO is also required.
  async void(req: VoidRequest): Promise<TxnResult> {
    return publish(req.transactionId, TRAN_CODE.void, TRAN_MODE.fetchTransaction, req.amountCents, {
      ...(req.providerRef ? { TRAN_NO: req.providerRef } : {}),
    });
  }

  // Live-tested end to end against a real captured transaction. Confirmed
  // TRAN_MODE "credit" (not "0"/FETCH TRANSACTION like capture/void) is
  // correct — matches Valor's "FETCH TRANSACTION" list excluding Refund.
  // Unlike capture/void, no TRAN_NO was required — REQ_TXN_ID + amount was
  // sufficient to identify and refund the original transaction.
  async refund(req: RefundRequest): Promise<TxnResult> {
    return publish(req.transactionId, TRAN_CODE.refund, TRAN_MODE.credit, req.amountCents);
  }

  async status(txnId: string): Promise<TxnResult> {
    const { appid, appkey, epi } = getCredentials();
    try {
      const envelope = await callValor({ appid, appkey, epi, txn_type: "vc_status", req_txn_id: txnId });
      return buildResult(envelope, 0);
    } catch (err) {
      if (err instanceof ValorTimeoutError) {
        return { status: "timeout", amountSettled: 0, transactionId: txnId, raw: { error: err.message } };
      }
      throw err;
    }
  }

  // UNVERIFIED — see file header. Not currently called anywhere in the app.
  async settle(): Promise<BatchResult> {
    const { appid, appkey, epi, channelId } = getCredentials();
    const envelope = await callValor({
      appid,
      appkey,
      epi,
      channel_id: channelId,
      txn_type: "vc_publish",
      version: "1",
      payload: { TRAN_MODE: TRAN_MODE.fetchTransaction, TRAN_CODE: TRAN_CODE.settlement },
    });
    return { batchId: "", totalCount: 0, totalAmountCents: 0, raw: envelope };
  }
}

export const valorConnectTerminal = new ValorConnectTerminal();
