import { prisma } from "@/lib/prisma";
import { fakeTerminal } from "@/lib/payments/fakeTerminal";
import { valorConnectTerminal } from "@/lib/payments/valorConnectTerminal";
import type { PaymentTerminal } from "@/lib/payments/terminal";

// Same real-vs-fake selection as payments.ts — duplicated rather than
// imported because payments.ts doesn't export it, and this is the only
// other place that needs to know which adapter is live.
const terminal: PaymentTerminal =
  process.env.VALOR_APP_ID && process.env.VALOR_APP_KEY && process.env.VALOR_EPI && process.env.VALOR_CHANNEL_ID
    ? valorConnectTerminal
    : fakeTerminal;

// PRD §4.8: "PMS payments vs. terminal batch — flags mismatches (critical
// under cash discount)." The PMS side is solid — real data, always
// available. The terminal side calls settle(), live-verified against the
// real Valor terminal (see valorConnectTerminal.ts) — but settle() isn't a
// harmless read, it's the real end-of-day action: it CLOSES whatever's
// currently open on the terminal. Kept as a separate, explicit,
// confirm-gated action (see PullBatchButton.tsx) rather than something run
// automatically on page load, precisely because loading this report should
// never have the side effect of closing a batch.
export async function getPmsPaymentsForDate(propertyId: string, date: Date) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const payments = await prisma.payment.findMany({
    where: {
      status: "approved",
      method: "card",
      createdAt: { gte: dayStart, lt: dayEnd },
      folio: { stay: { propertyId } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    date: dayStart,
    count: payments.length,
    totalAmountCents: payments.reduce((sum, p) => sum + Math.round(Number(p.amountSettled ?? 0) * 100), 0),
    payments: payments.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      amountSettled: Number(p.amountSettled ?? 0),
      providerTransactionId: p.providerTransactionId,
      authCode: p.authCode,
    })),
  };
}

export async function pullTerminalBatch() {
  return terminal.settle();
}
