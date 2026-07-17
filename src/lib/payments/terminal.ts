// The PCI-scope boundary (CLAUDE.md rule #1): the PMS never sees, stores, or
// transmits cardholder data. This is the only interface app code is allowed
// to call for taking a card payment — never a provider SDK directly.
// PRD §5.2.

export type TxnStatus = "approved" | "declined" | "voided" | "error" | "timeout";

export type SaleRequest = {
  amountCents: number;
  invoiceNumber: string; // = folio id, max 24 chars — used for reconciliation
  allowPartial?: boolean;
  tokenize?: boolean; // request a token for card-on-file
  token?: string; // charge an existing token (weekly renewals)
};

export type PreAuthRequest = {
  amountCents: number;
  invoiceNumber: string;
};

export type CaptureRequest = {
  transactionId: string;
  amountCents: number;
};

export type VoidRequest = {
  transactionId: string;
};

export type RefundRequest = {
  transactionId: string;
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
  status(txnId: string): Promise<TxnResult>; // for timeout recovery
  settle(): Promise<BatchResult>;
  ping(): Promise<boolean>;
}
