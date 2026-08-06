import { prisma } from "@/lib/prisma";
import { fakeTerminal } from "@/lib/payments/fakeTerminal";
import { valorConnectTerminal } from "@/lib/payments/valorConnectTerminal";
import type { PaymentTerminal, TxnResult } from "@/lib/payments/terminal";
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

// Valor Connect needs the original transaction's TRAN_NO to void/capture it
// (discovered live — see valorConnectTerminal.ts). It isn't a field on
// TxnResult, but it's in the raw response we already persist.
function extractProviderRef(rawResponse: Prisma.JsonValue | null): string | undefined {
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) return undefined;
  const response = (rawResponse as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return undefined;
  const tranNo = (response as Record<string, unknown>).TRAN_NO;
  return typeof tranNo === "string" ? tranNo : undefined;
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

  // NOTE: PRD §5.3 specifies invoiceNumber = folio id. That means two
  // pending card attempts against the same folio (e.g. a retry before the
  // first is reconciled) collide in this fake adapter's in-memory
  // bookkeeping — a real Valor integration's actual reconciliation
  // mechanics may need a finer-grained reference. Flagged, not fixed here.
  const result = await terminal.sale({ amountCents, invoiceNumber: folio.id.slice(0, 24), surchargeAmountCents });

  return applyTerminalResult(payment.id, input.propertyId, actingUser.id, result);
}

export async function reconcilePayment(input: { propertyId: string; paymentId: string }) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: input.paymentId } });
  if (payment.status !== "pending") return payment;

  const actingUser = await getActingUser(input.propertyId);
  const result = await terminal.status(payment.folioId.slice(0, 24));
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

  const amountCents = Math.round(input.amount * 100);
  const result = await terminal.preAuth({ amountCents, invoiceNumber: folio.id.slice(0, 24) });

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

  return updated;
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

  return updated;
}
