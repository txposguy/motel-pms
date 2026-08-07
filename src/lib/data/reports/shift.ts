import { prisma } from "@/lib/prisma";

// PRD §4.8 calls for "cash in drawer" and "over/short" per shift, which
// needs an actual shift boundary (clock-in/out) and a counted-cash entry —
// neither exists anywhere in the app yet (no clock-in concept at all). Built
// here as what the data CAN answer today: cash/card totals and transaction
// count per user, for a chosen date range — a shift summary, not a true
// drawer reconciliation. Flagged in the UI, not silently left out.
export async function getShiftReport(propertyId: string, from: Date, to: Date) {
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  const payments = await prisma.payment.findMany({
    where: {
      status: "approved",
      createdAt: { gte: from, lt: toExclusive },
      folio: { stay: { propertyId } },
    },
    include: { createdByUser: true },
    orderBy: { createdAt: "asc" },
  });

  const byUser = new Map<string, { name: string; cash: number; card: number; count: number }>();
  for (const p of payments) {
    const key = p.createdByUserId;
    const entry = byUser.get(key) ?? { name: p.createdByUser.name, cash: 0, card: 0, count: 0 };
    const amount = Number(p.amountSettled ?? 0);
    if (p.method === "card") entry.card += amount;
    else entry.cash += amount; // cash, check, other
    entry.count += 1;
    byUser.set(key, entry);
  }

  return {
    from,
    to,
    byUser: Array.from(byUser.values()).map((u) => ({
      name: u.name,
      cash: Math.round(u.cash * 100) / 100,
      card: Math.round(u.card * 100) / 100,
      transactionCount: u.count,
    })),
  };
}
