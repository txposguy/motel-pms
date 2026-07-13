import { prisma } from "@/lib/prisma";
import { encrypt, hashForLookup } from "@/lib/encryption";
import { computeExpectedCheckOut } from "@/lib/checkin/rate";
import type { IdType } from "@/generated/prisma/enums";

export async function getCheckInFormData(propertyId: string, preselectedRoomId?: string) {
  const [property, vacantRooms, ratePlans, selectedRoom] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: propertyId } }),
    prisma.room.findMany({
      where: { propertyId, status: { in: ["vacant_clean", "vacant_dirty"] } },
      include: { roomType: true },
      orderBy: { roomNumber: "asc" },
    }),
    prisma.ratePlan.findMany({
      where: { propertyId, active: true },
      orderBy: { unit: "asc" },
    }),
    preselectedRoomId
      ? prisma.room.findFirst({ where: { id: preselectedRoomId, propertyId } })
      : Promise.resolve(null),
  ]);

  return { property, vacantRooms, ratePlans, selectedRoom };
}

export async function findGuestByIdNumber(propertyId: string, idNumber: string) {
  const hash = hashForLookup(idNumber);
  const guest = await prisma.guest.findFirst({
    where: { propertyId, idNumberHash: hash },
    orderBy: { createdAt: "desc" },
  });
  if (!guest) return null;

  const stayCount = await prisma.stay.count({ where: { guestId: guest.id } });
  const lastStay = await prisma.stay.findFirst({
    where: { guestId: guest.id },
    orderBy: { checkedInAt: "desc" },
  });

  return {
    id: guest.id,
    firstName: guest.firstName,
    middleName: guest.middleName,
    lastName: guest.lastName,
    addressLine1: guest.addressLine1,
    city: guest.city,
    state: guest.state,
    zip: guest.zip,
    phone: guest.phone,
    email: guest.email,
    dnrFlag: guest.dnrFlag,
    dnrReason: guest.dnrReason,
    stayCount,
    lastStayAt: lastStay?.checkedInAt ?? null,
  };
}

export type CheckInInput = {
  propertyId: string;
  roomId: string;
  ratePlanId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
  dob?: string;
  phone?: string;
  email?: string;
  idType?: IdType;
  idNumber?: string;
  idState?: string;
  idExpiration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehiclePlate?: string;
  vehicleState?: string;
  adults: number;
  children: number;
  additionalGuests: string[];
};

export async function checkInGuest(input: CheckInInput) {
  const [property, room, ratePlan, actingUser] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: input.propertyId } }),
    prisma.room.findFirstOrThrow({ where: { id: input.roomId, propertyId: input.propertyId } }),
    prisma.ratePlan.findFirstOrThrow({ where: { id: input.ratePlanId, propertyId: input.propertyId } }),
    prisma.user.findFirstOrThrow({ where: { propertyId: input.propertyId, role: "owner" } }),
  ]);

  if (room.status === "occupied" || room.status === "out_of_order") {
    throw new Error(`Room ${room.roomNumber} is not available to check in.`);
  }

  const checkedInAt = new Date();
  const expectedCheckOutAt = computeExpectedCheckOut(
    { unit: ratePlan.unit, durationUnits: ratePlan.durationUnits },
    checkedInAt,
    property.checkOutTime
  );
  const businessDate = new Date(checkedInAt.toDateString());

  const result = await prisma.$transaction(async (tx) => {
    const guest = await tx.guest.create({
      data: {
        propertyId: input.propertyId,
        firstName: input.firstName,
        middleName: input.middleName || null,
        lastName: input.lastName,
        addressLine1: input.addressLine1 || null,
        city: input.city || null,
        state: input.state || null,
        zip: input.zip || null,
        dob: input.dob ? new Date(input.dob) : null,
        phone: input.phone || null,
        email: input.email || null,
        idType: input.idType || null,
        idNumberEncrypted: input.idNumber ? encrypt(input.idNumber) : null,
        idNumberHash: input.idNumber ? hashForLookup(input.idNumber) : null,
        idState: input.idState || null,
        idExpiration: input.idExpiration ? new Date(input.idExpiration) : null,
        vehicleMake: input.vehicleMake || null,
        vehicleModel: input.vehicleModel || null,
        vehicleColor: input.vehicleColor || null,
        vehiclePlate: input.vehiclePlate || null,
        vehicleState: input.vehicleState || null,
      },
    });

    const stay = await tx.stay.create({
      data: {
        propertyId: input.propertyId,
        guestId: guest.id,
        roomId: room.id,
        ratePlanId: ratePlan.id,
        checkedInAt,
        expectedCheckOutAt,
        adults: input.adults,
        children: input.children,
        additionalGuests: input.additionalGuests.length ? input.additionalGuests : undefined,
        checkedInByUserId: actingUser.id,
      },
    });

    const folio = await tx.folio.create({
      data: { stayId: stay.id },
    });

    await tx.folioLine.create({
      data: {
        folioId: folio.id,
        createdByUserId: actingUser.id,
        type: "room_charge",
        description: `${ratePlan.name} — Room ${room.roomNumber}`,
        amount: ratePlan.baseAmount,
        businessDate,
      },
    });

    await tx.room.update({
      where: { id: room.id },
      data: { status: "occupied" },
    });

    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: actingUser.id,
        entityType: "stay",
        entityId: stay.id,
        action: "check_in",
        after: {
          guestId: guest.id,
          roomId: room.id,
          roomNumber: room.roomNumber,
          ratePlanId: ratePlan.id,
          checkedInAt: checkedInAt.toISOString(),
          expectedCheckOutAt: expectedCheckOutAt.toISOString(),
        },
      },
    });

    return { guest, stay, room };
  });

  return result;
}
