import { prisma } from "@/lib/prisma";
import { fakeTerminal } from "@/lib/payments/fakeTerminal";
import { valorConnectTerminal } from "@/lib/payments/valorConnectTerminal";
import type { PaymentTerminal, TxnResult } from "@/lib/payments/terminal";
import { extractProviderRef } from "@/lib/payments/rawResponse";
import type { Prisma } from "@/generated/prisma/client";
import { getActingUser } from "@/lib/data/actingUser";

// Real adapter when Valor credentials are configured, fake otherwise — this
// is the one line that changes when the terminal moves from demo to
// production; nothing else in the app knows or cares which one is active.
const terminal: PaymentTerminal =
  process.env.VALOR_APP_ID && process.env.VALOR_APP_KEY && process.env.VALOR_EPI && process.env.VALOR_CHANNEL_ID
    ? valorConnectTerminal
    : fakeTerminal;

function mapTxnStatus(status: TxnResult["status"]): "approved" | "declined" | "voided" {
  if (status === "approved") return "approved";
  if (status === "voided") return "voided";
  return "declined"; // declined | error — closest fit; clerk can retry either way
}

// Known provider errorCodes worth explaining specifically to the clerk,
// instead of just "declined" — protocol-level failures where the request
// never reached a card decision at all, as opposed to a genuine decline
// (insufficient funds, etc.), where the terminal's own reason is enough.
// VC03 confirmed live (2026-08-18): pushed a sale while the terminal had
// been switched to standalone mode — it never received the request, and
// Valor's response was error_no "VC03" / desc "DEVICE OFFLINE".
const KNOWN_TERMINAL_ERRORS: Record<string, string> = {
  VC03: "The terminal isn't in Valor Connect mode, so it never received this request. Press the VC button (small black circle, top center of the terminal screen) to switch it back to Valor Connect mode, then try again.",
};

function friendlyTerminalError(result: TxnResult): string | undefined {
  return result.errorCode ? KNOWN_TERMINAL_ERRORS[result.errorCode] : undefined;
}

// PRD §6.2 rule 3: the card fee is never blended into the room charge — it
// posts as its own incidental line so room revenue and tax stay clean. This
// is what makes "reconciliation must tolerate amount_requested ≠
// amount_settled" (rule 4) actually balance: once this line posts, the
// folio's charges total rises to match what the guest was really charged.
// Scoped to sale() only — a pre-auth is a hold, not a purchase, so its
// capture doesn't get a cash-discount adjustment.
async function maybePostNonCashAdjustment(payment: { id: string; folioId: string; method: string; amountRequested: unknown; amountSettled: unknown }, propertyId: string, userId: string) {
  if (payment.method !== "card") return;
  const requested = Number(payment.amountRequested);
  const settled = payment.amountSettled === null ? null : Number(payment.amountSettled);
  if (settled === null || settled <= requested) return;

  const fee = Math.round((settled - requested) * 100) / 100;
  const businessDate = new Date(new Date().toDateString());

  const line = await prisma.folioLine.create({
    data: {
      folioId: payment.folioId,
      createdByUserId: userId,
      type: "incidental",
      description: "Non-Cash Adjustment",
      amount: fee,
      businessDate,
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId,
      userId,
      entityType: "folio_line",
      entityId: line.id,
      action: "post_non_cash_adjustment",
      after: { paymentId: payment.id, fee },
    },
  });
}

async function applyTerminalResult(paymentId: string, propertyId: string, userId: string, result: TxnResult) {
  // A timeout means "unknown" — never auto-retry (risk of double-charging
  // the guest). Leave status = pending; the clerk resolves it via RECONCILE.
  if (result.status === "timeout") {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { rawResponse: result.raw as Prisma.InputJsonValue },
    });
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: mapTxnStatus(result.status),
      amountSettled: result.amountSettled / 100,
      providerTransactionId: result.transactionId || null,
      providerRrn: result.rrn || null,
      authCode: result.authCode || null,
      maskedPan: result.maskedPan || null,
      cardBrand: result.cardBrand || null,
      entryMode: result.entryMode || null,
      rawResponse: result.raw as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId,
      userId,
      entityType: "payment",
      entityId: paymentId,
      action: `payment_${updated.status}`,
      after: { transactionId: result.transactionId, amountSettled: result.amountSettled },
    },
  });

  if (updated.status === "approved" && !updated.isPreauth) {
    await maybePostNonCashAdjustment(updated, propertyId, userId);
  }

  // The decline is already recorded above (audit trail intact) — this only
  // changes what the clerk sees right now, from a bare "declined" to
  // actionable guidance for the specific, known cause.
  const friendly = friendlyTerminalError(result);
  if (friendly) throw new Error(friendly);

  return updated;
}

export async function takePayment(input: {
  propertyId: string;
  folioId: string;
  method: "cash" | "card" | "check" | "other";
  amount: number;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter a valid amount.");

  const folio = await prisma.folio.findFirstOrThrow({ where: { id: input.folioId } });
  if (folio.status !== "open") throw new Error("This folio is closed.");

  const actingUser = await getActingUser(input.propertyId);

  // Cardholder data never touches the PMS (CLAUDE.md rule #1) — cash/check
  // are recorded directly, card payments only ever go through the terminal
  // adapter.
  if (input.method !== "card") {
    const payment = await prisma.payment.create({
      data: {
        folioId: folio.id,
        createdByUserId: actingUser.id,
        method: input.method,
        amountRequested: input.amount,
        amountSettled: input.amount,
        status: "approved",
        provider: "none",
      },
    });
    await prisma.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: actingUser.id,
        entityType: "payment",
        entityId: payment.id,
        action: "payment_recorded",
        after: { method: input.method, amount: input.amount },
      },
    });
    return payment;
  }

  // Write the payment as pending BEFORE calling the terminal (CLAUDE.md
  // rule #8) — if the call times out we still have a row to reconcile.
  const payment = await prisma.payment.create({
    data: {
      folioId: folio.id,
      createdByUserId: actingUser.id,
      method: "card",
      amountRequested: input.amount,
      status: "pending",
      provider: "valor",
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: actingUser.id,
      entityType: "payment",
      entityId: payment.id,
      action: "payment_initiated",
      after: { method: "card", amount: input.amount },
    },
  });

  const amountCents = Math.round(input.amount * 100);
  const property = await prisma.property.findUniqueOrThrow({ where: { id: input.propertyId } });
  const cashDiscountPercent = property.cashDiscountPercent ? Number(property.cashDiscountPercent) : 0;

  let surchargeAmountCents: number | undefined;
  if (property.cashDiscountMode === "host" && cashDiscountPercent > 0) {
    // Host-calculated: we compute the exact surcharge and tell the terminal
    // what to add, for exact control of rounding (PRD §6.3).
    surchargeAmountCents = Math.round(amountCents * (cashDiscountPercent / 100));
  } else if (property.cashDiscountMode === "terminal" && cashDiscountPercent > 0) {
    // Terminal-calculated (default): the terminal applies its own
    // configured surcharge — see fakeTerminal.ts for why this call only
    // exists on the fake adapter and has no real-adapter equivalent.
    fakeTerminal.configureMerchant({ cashDiscountPercent });
  } else {
    fakeTerminal.configureMerchant({ cashDiscountPercent: 0 });
  }

  // Use the payment row's own id, not the folio id, as the reference sent to
  // the terminal — a live refund test surfaced that Valor identifies a
  // transaction by this reference alone (see refundPayment), so any folio
  // with more than one card transaction (a retry, a second pre-auth, a
  // pre-auth plus a sale) would have them collide on the same reference if
  // it were shared. payment.id is unique per attempt.
  const result = await terminal.sale({ amountCents, invoiceNumber: payment.id.slice(0, 24), surchargeAmountCents });

  return applyTerminalResult(payment.id, input.propertyId, actingUser.id, result);
}

export async function reconcilePayment(input: { propertyId: string; paymentId: string }) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: input.paymentId } });
  if (payment.status !== "pending") return payment;

  const actingUser = await getActingUser(input.propertyId);

  // A pending refund was published under the ORIGINAL transaction's
  // reference, not the folio id (see refundPayment) — poll that instead.
  if (payment.refundsPaymentId) {
    const original = await prisma.payment.findFirstOrThrow({ where: { id: payment.refundsPaymentId } });
    if (!original.providerTransactionId) throw new Error("Missing transaction reference to reconcile this refund.");
    const refundable = await computeRefundable(original);
    const amount = Math.abs(Number(payment.amountRequested));
    // This refund's own attempt already counts as "consumed" inside
    // computeRefundable (status is still pending), so add it back to get
    // what was refundable right before this specific attempt.
    const refundableBefore = Math.round((refundable + amount) * 100) / 100;
    const result = await terminal.status(original.providerTransactionId);
    return applyRefundResult(payment.id, original, amount, refundableBefore, input.propertyId, actingUser.id, result);
  }

  const result = await terminal.status(payment.id.slice(0, 24));
  return applyTerminalResult(payment.id, input.propertyId, actingUser.id, result);
}

export async function takePreAuth(input: { propertyId: string; folioId: string; amount: number }) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter a valid amount.");

  const folio = await prisma.folio.findFirstOrThrow({ where: { id: input.folioId } });
  if (folio.status !== "open") throw new Error("This folio is closed.");

  const actingUser = await getActingUser(input.propertyId);

  const payment = await prisma.payment.create({
    data: {
      folioId: folio.id,
      createdByUserId: actingUser.id,
      method: "card",
      amountRequested: input.amount,
      status: "pending",
      provider: "valor",
      isPreauth: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: actingUser.id,
      entityType: "payment",
      entityId: payment.id,
      action: "preauth_initiated",
      after: { amount: input.amount },
    },
  });

  // payment.id, not folio.id — see the matching note in takePayment.
  const amountCents = Math.round(input.amount * 100);
  const result = await terminal.preAuth({ amountCents, invoiceNumber: payment.id.slice(0, 24) });

  return applyTerminalResult(payment.id, input.propertyId, actingUser.id, result);
}

export async function capturePreAuth(input: { propertyId: string; paymentId: string; amount?: number }) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: input.paymentId } });
  if (!payment.isPreauth) throw new Error("This payment is not a pre-authorization.");
  if (payment.status !== "approved") throw new Error("Only an approved pre-authorization can be captured.");
  if (payment.preauthCapturedAt) throw new Error("This pre-authorization has already been captured.");
  if (!payment.providerTransactionId) throw new Error("Missing transaction reference for this pre-authorization.");

  const actingUser = await getActingUser(input.propertyId);
  const captureAmount = input.amount ?? Number(payment.amountRequested);
  const amountCents = Math.round(captureAmount * 100);

  const result = await terminal.capture({
    transactionId: payment.providerTransactionId,
    amountCents,
    providerRef: extractProviderRef(payment.rawResponse),
  });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: result.status === "approved" ? "approved" : "declined",
      amountSettled: result.amountSettled / 100,
      preauthCapturedAt: result.status === "approved" ? new Date() : null,
      rawResponse: result.raw as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: actingUser.id,
      entityType: "payment",
      entityId: payment.id,
      action: "preauth_captured",
      after: { amountSettled: result.amountSettled },
    },
  });

  // Discovered via a live capture test: a captured pre-auth can carry the
  // same terminal-side surcharge a regular sale does (the hold becomes a
  // real charge at that point). capturePreAuth doesn't go through
  // applyTerminalResult like takePayment/reconcile do, so without this it
  // silently missed posting the Non-Cash Adjustment line a sale gets.
  if (updated.status === "approved") {
    await maybePostNonCashAdjustment(updated, input.propertyId, actingUser.id);
  }

  const friendly = friendlyTerminalError(result);
  if (friendly) throw new Error(friendly);

  return updated;
}

// How much of `payment` is still eligible to be refunded — its settled
// amount minus anything already refunded (or in-flight, to stop two
// concurrent refund attempts from together exceeding what was actually paid).
async function computeRefundable(payment: { id: string; amountSettled: unknown }): Promise<number> {
  const settled = Number(payment.amountSettled ?? 0);
  const priorRefunds = await prisma.payment.findMany({
    where: { refundsPaymentId: payment.id, status: { in: ["approved", "pending"] } },
  });
  const consumed = priorRefunds.reduce((sum, r) => sum + Math.abs(Number(r.amountRequested)), 0);
  return Math.round((settled - consumed) * 100) / 100;
}

// Flips the ORIGINAL payment to status = refunded, but only once nothing is
// left to refund — a partial refund leaves it "approved" (some of that money
// is still legitimately settled).
async function maybeMarkOriginalRefunded(
  original: { id: string },
  amount: number,
  refundableBefore: number,
  propertyId: string,
  userId: string
) {
  const remaining = Math.round((refundableBefore - amount) * 100) / 100;
  if (remaining > 0) return;

  await prisma.payment.update({ where: { id: original.id }, data: { status: "refunded" } });
  await prisma.auditLog.create({
    data: {
      propertyId,
      userId,
      entityType: "payment",
      entityId: original.id,
      action: "payment_refunded",
      after: { amount },
    },
  });
}

async function applyRefundResult(
  refundPaymentId: string,
  original: { id: string },
  amount: number,
  refundableBefore: number,
  propertyId: string,
  userId: string,
  result: TxnResult
) {
  // Same timeout discipline as applyTerminalResult (CLAUDE.md rule #8): never
  // auto-retry, leave it pending for the clerk to RECONCILE.
  if (result.status === "timeout") {
    await prisma.payment.update({
      where: { id: refundPaymentId },
      data: { rawResponse: result.raw as Prisma.InputJsonValue },
    });
    return prisma.payment.findUniqueOrThrow({ where: { id: refundPaymentId } });
  }

  const approved = result.status === "approved";
  const updated = await prisma.payment.update({
    where: { id: refundPaymentId },
    data: {
      status: approved ? "approved" : "declined",
      amountSettled: approved ? -(result.amountSettled / 100) : null,
      providerTransactionId: result.transactionId || null,
      providerRrn: result.rrn || null,
      authCode: result.authCode || null,
      maskedPan: result.maskedPan || null,
      cardBrand: result.cardBrand || null,
      entryMode: result.entryMode || null,
      rawResponse: result.raw as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId,
      userId,
      entityType: "payment",
      entityId: refundPaymentId,
      action: approved ? "refund_approved" : "refund_declined",
      after: { refundsPaymentId: original.id, amount, transactionId: result.transactionId },
    },
  });

  if (approved) {
    await maybeMarkOriginalRefunded(original, amount, refundableBefore, propertyId, userId);
  }

  const friendly = friendlyTerminalError(result);
  if (friendly) throw new Error(friendly);

  return updated;
}

// Refunds all or part of a previously settled payment (a completed sale, or
// a captured pre-auth — not an open pre-auth, which is voided instead since
// no money has actually moved yet). Card refunds go through the terminal;
// cash/check/other just record that the clerk handed money back.
export async function refundPayment(input: { propertyId: string; paymentId: string; amount?: number }) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: input.paymentId } });
  if (payment.refundsPaymentId) throw new Error("A refund can't itself be refunded.");
  if (payment.status !== "approved") throw new Error("Only an approved, settled payment can be refunded.");
  if (payment.isPreauth && !payment.preauthCapturedAt) {
    throw new Error("This is an open pre-authorization — void it instead of refunding.");
  }
  if (payment.method === "card" && !payment.providerTransactionId) {
    throw new Error("Missing transaction reference for this payment.");
  }

  const refundable = await computeRefundable(payment);
  if (refundable <= 0) throw new Error("This payment has already been fully refunded.");

  const amount = input.amount ?? refundable;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid refund amount.");
  if (Math.round(amount * 100) > Math.round(refundable * 100)) {
    throw new Error(`Cannot refund more than $${refundable.toFixed(2)} — that's all that's left on this payment.`);
  }

  const actingUser = await getActingUser(input.propertyId);

  // Write the refund as pending BEFORE calling the terminal (CLAUDE.md rule
  // #8) — same reasoning as takePayment: if the call times out, there's
  // still a row to reconcile instead of a lost, unrecorded attempt.
  const refund = await prisma.payment.create({
    data: {
      folioId: payment.folioId,
      createdByUserId: actingUser.id,
      method: payment.method,
      amountRequested: -amount,
      status: payment.method === "card" ? "pending" : "approved",
      provider: payment.method === "card" ? payment.provider : "none",
      refundsPaymentId: payment.id,
      ...(payment.method !== "card" ? { amountSettled: -amount } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: actingUser.id,
      entityType: "payment",
      entityId: refund.id,
      action: "refund_initiated",
      after: { refundsPaymentId: payment.id, amount, method: payment.method },
    },
  });

  if (payment.method !== "card") {
    await maybeMarkOriginalRefunded(payment, amount, refundable, input.propertyId, actingUser.id);
    return refund;
  }

  const amountCents = Math.round(amount * 100);
  const result = await terminal.refund({
    transactionId: payment.providerTransactionId!,
    amountCents,
  });

  return applyRefundResult(refund.id, payment, amount, refundable, input.propertyId, actingUser.id, result);
}

export async function voidPreAuth(input: { propertyId: string; paymentId: string }) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: input.paymentId } });
  if (!payment.isPreauth) throw new Error("This payment is not a pre-authorization.");
  if (payment.status !== "approved") throw new Error("Only an approved pre-authorization can be voided.");
  if (payment.preauthCapturedAt) throw new Error("This pre-authorization has already been captured — use refund instead.");
  if (!payment.providerTransactionId) throw new Error("Missing transaction reference for this pre-authorization.");

  const actingUser = await getActingUser(input.propertyId);
  const amountCents = Math.round(Number(payment.amountRequested) * 100);
  const result = await terminal.void({
    transactionId: payment.providerTransactionId,
    amountCents,
    providerRef: extractProviderRef(payment.rawResponse),
  });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "voided",
      amountSettled: 0,
      rawResponse: result.raw as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: actingUser.id,
      entityType: "payment",
      entityId: payment.id,
      action: "preauth_voided",
      after: {},
    },
  });

  const friendly = friendlyTerminalError(result);
  if (friendly) throw new Error(friendly);

  return updated;
}

// Asks the terminal to reprint its own paper receipt for a card
// transaction — a duplicate of what physically printed at the time,
// distinct from the PMS-generated receipt (src/lib/data/receipts.ts, works
// for every payment method, no terminal involved). Card only: cash/check
// never had a terminal receipt to reprint. Live-tested — see the comment on
// ValorConnectTerminal.reprint() for why no providerRef is passed here,
// unlike capture/void.
export async function reprintAtTerminal(input: { propertyId: string; paymentId: string }) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: input.paymentId } });
  if (payment.method !== "card") throw new Error("Only card payments can be reprinted at the terminal.");
  if (!payment.providerTransactionId) throw new Error("Missing transaction reference for this payment.");

  const actingUser = await getActingUser(input.propertyId);
  const amountCents = Math.round(Math.abs(Number(payment.amountSettled ?? payment.amountRequested)) * 100);

  const result = await terminal.reprint({
    transactionId: payment.providerTransactionId,
    amountCents,
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: actingUser.id,
      entityType: "payment",
      entityId: payment.id,
      action: result.status === "approved" ? "receipt_reprinted_at_terminal" : "receipt_reprint_failed",
      after: { status: result.status },
    },
  });

  if (result.status !== "approved") {
    throw new Error(friendlyTerminalError(result) ?? "The terminal could not reprint this receipt — check the terminal screen.");
  }

  return result;
}
