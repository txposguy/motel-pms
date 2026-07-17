import { prisma } from "@/lib/prisma";
import { fakeTerminal } from "@/lib/payments/fakeTerminal";
import type { PaymentTerminal, TxnResult } from "@/lib/payments/terminal";
import type { Prisma } from "@/generated/prisma/client";

// Swap this for the real Valor adapter once there's a demo terminal + the
// ValorPay POS Integration Specification in hand — nothing else in this
// file (or anywhere else that takes a payment) needs to change.
const terminal: PaymentTerminal = fakeTerminal;

async function getActingUser(propertyId: string) {
  return prisma.user.findFirstOrThrow({ where: { propertyId, role: "owner" } });
}

function mapTxnStatus(status: TxnResult["status"]): "approved" | "declined" | "voided" {
  if (status === "approved") return "approved";
  if (status === "voided") return "voided";
  return "declined"; // declined | error — closest fit; clerk can retry either way
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
  // NOTE: PRD §5.3 specifies invoiceNumber = folio id. That means two
  // pending card attempts against the same folio (e.g. a retry before the
  // first is reconciled) collide in this fake adapter's in-memory
  // bookkeeping — a real Valor integration's actual reconciliation
  // mechanics may need a finer-grained reference. Flagged, not fixed here.
  const result = await terminal.sale({ amountCents, invoiceNumber: folio.id.slice(0, 24) });

  return applyTerminalResult(payment.id, input.propertyId, actingUser.id, result);
}

export async function reconcilePayment(input: { propertyId: string; paymentId: string }) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: input.paymentId } });
  if (payment.status !== "pending") return payment;

  const actingUser = await getActingUser(input.propertyId);
  const result = await terminal.status(payment.folioId.slice(0, 24));
  return applyTerminalResult(payment.id, input.propertyId, actingUser.id, result);
}
