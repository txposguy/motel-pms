import { prisma } from "@/lib/prisma";
import { computeBalance } from "@/lib/folio/balance";

export async function getInHouseReport(propertyId: string) {
  const stays = await prisma.stay.findMany({
    where: { propertyId, status: "in_house" },
    include: {
      guest: true,
      room: true,
      ratePlan: true,
      folio: { include: { lines: true, payments: true } },
    },
    orderBy: { room: { roomNumber: "asc" } },
  });

  return stays.map((s) => {
    const charges = s.folio ? s.folio.lines.reduce((sum, l) => sum + Number(l.amount), 0) : 0;
    const balance = s.folio
      ? computeBalance(
          charges,
          s.folio.payments.map((p) => ({
            status: p.status,
            isPreauth: p.isPreauth,
            preauthCapturedAt: p.preauthCapturedAt,
            amountSettled: p.amountSettled === null ? null : Number(p.amountSettled),
          }))
        )
      : 0;

    return {
      stayId: s.id,
      guestName: `${s.guest.firstName} ${s.guest.lastName}`,
      roomNumber: s.room.roomNumber,
      ratePlanName: s.ratePlan.name,
      checkedInAt: s.checkedInAt,
      expectedCheckOutAt: s.expectedCheckOutAt,
      balance,
      taxExempt: s.taxExempt,
    };
  });
}
