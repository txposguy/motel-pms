import { prisma } from "@/lib/prisma";

// The Daily Flash is just a read of a closed business_dates snapshot — all
// the numbers it needs (rooms sold, occupancy, ADR, RevPAR, tax, cash vs
// card) were already computed once, correctly, by night audit. No new
// computation here; picking a date this way also means the report can never
// disagree with what night audit actually closed for that date.
export async function getDailyFlash(propertyId: string, businessDate?: Date) {
  const row = businessDate
    ? await prisma.businessDate.findUnique({
        where: { propertyId_businessDate: { propertyId, businessDate } },
      })
    : await prisma.businessDate.findFirst({
        where: { propertyId },
        orderBy: { businessDate: "desc" },
      });

  if (!row) return null;

  return {
    businessDate: row.businessDate,
    roomsSold: row.roomsSold,
    occupancyPercent: Number(row.occupancyPercent),
    roomRevenue: Number(row.roomRevenue),
    adr: Number(row.adr),
    revpar: Number(row.revpar),
    taxCollected: Number(row.taxCollected),
    paymentsCash: Number(row.paymentsCash),
    paymentsCard: Number(row.paymentsCard),
  };
}
