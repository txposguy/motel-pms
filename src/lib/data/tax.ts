import { prisma } from "@/lib/prisma";
import type { TaxRuleInput } from "@/lib/tax";

export async function getActiveTaxRules(propertyId: string, asOf: Date): Promise<TaxRuleInput[]> {
  const rules = await prisma.taxRule.findMany({
    where: {
      propertyId,
      active: true,
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
      ],
    },
  });
  return rules.map((r) => ({ id: r.id, name: r.name, ratePercent: Number(r.ratePercent), appliesTo: r.appliesTo }));
}
