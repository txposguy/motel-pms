// The PCI-scope boundary (CLAUDE.md rule #1): the PMS never sees, stores, or
// transmits cardholder data. This is the only interface app code is allowed
// to call for taking a card payment — never a provider SDK directly.
// PRD §5.2.

export type TxnStatus = "approved" | "declined" | "voided" | "error" | "timeout";

export type SaleRequest = {
  amountCents: number; // always the CASH price (PRD §6.2 rule 1) — see surchargeAmountCents for card
  // = the payment row's own id, max 24 chars — used for reconciliation.
  // Must be unique PER TRANSACTION ATTEMPT, not shared across a folio: a
  // live refund test against Valor Connect showed the provider identifies a
  // transaction by this reference alone, so two card transactions on the
  // same folio sharing one reference (e.g. both using the folio id, as
  // originally specified) become ambiguous to look up individually later.
  invoiceNumber: string;
  allowPartial?: boolean;
  tokenize?: boolean; // request a token for card-on-file
  token?: string; // charge an existing token (weekly renewals)
  // Host-calculated cash discount (PRD §6.3): set only in `host` mode, where
  // the PMS computes the exact surcharge and tells the terminal what to add
  // on top of amountCents, rather than letting the terminal compute its own.
  surchargeAmountCents?: number;
};

export type PreAuthRequest = {
  amountCents: number;
  invoiceNumber: string;
};

export type CaptureRequest = {
  transactionId: string;
  amountCents: number;
  // Same reference the original sale/preauth returned — see VoidRequest.
  // Not yet live-tested for capture specifically, but capture uses the same
  // TRAN_MODE "FETCH TRANSACTION" family as void, where this was required.
  providerRef?: string;
};

export type VoidRequest = {
  transactionId: string;
  // Discovered via a live test against Valor Connect: voiding with amount 0
  // is rejected ("Invalid Amount") — it validates against the original
  // transaction's amount, so callers must supply it.
  amountCents: number;
  // The original transaction's TRAN_NO, also discovered live — REQ_TXN_ID
  // and amount alone aren't enough to identify which transaction to act on
  // ("Tran/Card Number/Transaction ID is Empty" without it).
  providerRef?: string;
};

export type RefundRequest = {
  transactionId: string;
  amountCents: number;
};

export type ReprintRequest = {
  transactionId: string;
  // Discovered live: unlike capture/void (same "FETCH TRANSACTION" family),
  // reprint does NOT take a providerRef/TRAN_NO — including one breaks the
  // lookup ("No Record Found!"). REQ_TXN_ID + amount alone is correct,
  // matching refund's behavior instead.
  amountCents: number;
};

export type TxnResult = {
  status: TxnStatus;
  amountSettled: number; // may exceed amountRequested under terminal-side cash discount
  feeApplied?: number;
  authCode?: string;
  rrn?: string;
  transactionId: string;
  maskedPan?: string;
  cardBrand?: string;
  entryMode?: string;
  token?: string;
  // Set on a protocol-level failure (the request never reached a card
  // decision at all — auth/config/connectivity problems), not on a normal
  // card decline. errorCode is the provider's own code (e.g. Valor's
  // "VC03"), so callers can react to specific ones — see payments.ts, which
  // turns VC03 ("DEVICE OFFLINE" — the terminal isn't in Valor Connect
  // mode) into an actionable message for the clerk instead of a bare
  // "declined".
  errorCode?: string;
  errorMessage?: string;
  raw: unknown; // always persist
};

export type BatchResult = {
  batchId: string;
  totalCount: number;
  totalAmountCents: number;
  raw: unknown;
};

export interface PaymentTerminal {
  sale(req: SaleRequest): Promise<TxnResult>;
  preAuth(req: PreAuthRequest): Promise<TxnResult>;
  capture(req: CaptureRequest): Promise<TxnResult>; // ticket/completion
  void(req: VoidRequest): Promise<TxnResult>;
  refund(req: RefundRequest): Promise<TxnResult>;
  reprint(req: ReprintRequest): Promise<TxnResult>; // re-prints the terminal's own paper receipt for a card transaction
  status(txnId: string): Promise<TxnResult>; // for timeout recovery
  settle(): Promise<BatchResult>;
  ping(): Promise<boolean>;
}
