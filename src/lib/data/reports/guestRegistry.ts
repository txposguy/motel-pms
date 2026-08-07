import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { getActingUser } from "@/lib/data/actingUser";

// PRD §4.8: "Access restricted to owner role and logged in audit_log." There's
// no real multi-user session system yet (see actingUser.ts — every action is
// already attributed to the owner), so the role restriction is trivially met
// today; the audit-log requirement is not, so this is the one report whose
// data fetch itself writes an audit entry — every other report only reads.
// This is also the one report that decrypts PII (id_number) rather than
// just reading masked/aggregate data, which is exactly why PRD singles it
// out for this treatment.
export async function getGuestRegistryExport(propertyId: string, from: Date, to: Date) {
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  const stays = await prisma.stay.findMany({
    where: { propertyId, checkedInAt: { gte: from, lt: toExclusive } },
    include: { guest: true, room: true },
    orderBy: { checkedInAt: "asc" },
  });

  const actingUser = await getActingUser(propertyId);
  await prisma.auditLog.create({
    data: {
      propertyId,
      userId: actingUser.id,
      entityType: "report",
      entityId: "guest_registry_export",
      action: "guest_registry_export_accessed",
      after: { from: from.toISOString(), to: to.toISOString(), stayCount: stays.length },
    },
  });

  return stays.map((s) => ({
    stayId: s.id,
    guestName: `${s.guest.firstName} ${s.guest.lastName}`,
    address: [s.guest.addressLine1, s.guest.city, s.guest.state, s.guest.zip].filter(Boolean).join(", "),
    idType: s.guest.idType,
    idNumber: s.guest.idNumberEncrypted ? decrypt(s.guest.idNumberEncrypted) : null,
    idState: s.guest.idState,
    vehiclePlate: s.guest.vehiclePlate,
    vehicleState: s.guest.vehicleState,
    vehicleMakeModel: [s.guest.vehicleMake, s.guest.vehicleModel, s.guest.vehicleColor].filter(Boolean).join(" "),
    roomNumber: s.room.roomNumber,
    checkedInAt: s.checkedInAt,
    checkedOutAt: s.checkedOutAt,
  }));
}
