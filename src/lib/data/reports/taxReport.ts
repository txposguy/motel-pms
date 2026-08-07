import { prisma } from "@/lib/prisma";

// PRD §7.2: "the owner must be able to see, on the tax report, exactly
// which stays were exempted and why." Filing-ready means: tax collected per
// rule (net of any retroactive credits — see below), and revenue split into
// taxable vs. exempt so the two reconcile against what was actually
// invoiced.
export async function getTaxReport(propertyId: string, from: Date, to: Date) {
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  const lines = await prisma.folioLine.findMany({
    where: {
      businessDate: { gte: from, lt: toExclusive },
      folio: { stay: { propertyId } },
      type: { in: ["room_charge", "tax", "adjustment"] },
    },
    include: { taxRule: true },
  });

  // Tax collected by rule — a retroactive exemption credit (type =
  // adjustment, posted by night audit) carries the same tax_rule_id as the
  // line it reverses and a negative amount, so summing everything with a
  // tax_rule_id set nets credits against what was collected automatically.
  const byRule = new Map<string, { name: string; ratePercent: number; collected: number }>();
  for (const line of lines) {
    if (!line.taxRuleId || !line.taxRule) continue;
    const entry = byRule.get(line.taxRuleId) ?? { name: line.taxRule.name, ratePercent: Number(line.taxRule.ratePercent), collected: 0 };
    entry.collected += Number(line.amount);
    byRule.set(line.taxRuleId, entry);
  }

  // Taxable vs. exempt revenue: a room_charge line is "taxable" if it has a
  // sibling tax line posted the same day on the same folio; otherwise the
  // stay was already exempt when it was charged.
  const taxLineKeys = new Set(lines.filter((l) => l.type === "tax").map((l) => `${l.folioId}:${l.businessDate.getTime()}`));
  let taxableRevenue = 0;
  let exemptRevenue = 0;
  for (const line of lines) {
    if (line.type !== "room_charge") continue;
    const key = `${line.folioId}:${line.businessDate.getTime()}`;
    if (taxLineKeys.has(key)) taxableRevenue += Number(line.amount);
    else exemptRevenue += Number(line.amount);
  }

  const exemptionEvents = await prisma.auditLog.findMany({
    where: { propertyId, action: "tax_exemption_triggered", createdAt: { gte: from, lt: toExclusive } },
    orderBy: { createdAt: "asc" },
  });
  const exemptedStayIds = exemptionEvents.map((e) => e.entityId);
  const exemptedStays = exemptedStayIds.length
    ? await prisma.stay.findMany({ where: { id: { in: exemptedStayIds } }, include: { guest: true, room: true } })
    : [];
  const stayById = new Map(exemptedStays.map((s) => [s.id, s]));

  return {
    from,
    to,
    byRule: Array.from(byRule.values()).map((r) => ({ ...r, collected: Math.round(r.collected * 100) / 100 })),
    taxableRevenue: Math.round(taxableRevenue * 100) / 100,
    exemptRevenue: Math.round(exemptRevenue * 100) / 100,
    totalTaxCollected: Math.round(Array.from(byRule.values()).reduce((sum, r) => sum + r.collected, 0) * 100) / 100,
    exemptions: exemptionEvents.map((e) => {
      const stay = stayById.get(e.entityId);
      const after = e.after as { reason?: string; retroactiveCredit?: number; retroactiveCreditApplied?: boolean } | null;
      return {
        stayId: e.entityId,
        guestName: stay ? `${stay.guest.firstName} ${stay.guest.lastName}` : "(guest record not found)",
        roomNumber: stay?.room.roomNumber ?? "—",
        reason: after?.reason ?? "permanent_resident_30day",
        retroactiveCredit: after?.retroactiveCreditApplied ? Number(after.retroactiveCredit ?? 0) : 0,
        triggeredAt: e.createdAt,
      };
    }),
  };
}
