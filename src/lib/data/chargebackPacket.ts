import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { getActingUser } from "@/lib/data/actingUser";
import { extractAuthResponseText } from "@/lib/payments/rawResponse";

// Option 1 from the chargeback-defense discussion: assemble everything
// LodgeDesk already has into one printable evidence packet the owner
// downloads/prints (as a PDF via the browser, same as every other document
// in this app — PRD §8: browser print, no native PDF driver in v1) and
// uploads to Valor's dispute portal themselves. Not an API submission —
// that would need Valor to actually expose a dispute API to sub-merchants,
// which isn't part of the semi-integration surface this app already talks
// to, and is a real open question, not something to build against blind.
//
// Card only: chargebacks are a card-network mechanism, cash/check payments
// can't be charged back this way.
//
// Decrypts the guest's ID number, same sensitive-PII treatment as the
// Guest Registry Export (src/lib/data/reports/guestRegistry.ts) — every
// access writes its own audit_log entry.
export async function getChargebackPacket(propertyId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, folio: { stay: { propertyId } } },
    include: {
      folio: {
        include: {
          lines: { orderBy: { businessDate: "asc" } },
          payments: { orderBy: { createdAt: "asc" } },
          stay: {
            include: { guest: true, room: { include: { roomType: true } }, ratePlan: true, property: true },
          },
        },
      },
    },
  });
  if (!payment) return null;
  if (payment.method !== "card") throw new Error("Chargeback packets only apply to card payments.");

  const { stay } = payment.folio;

  const timelineEntityIds = [stay.id, ...payment.folio.payments.map((p) => p.id)];
  const timeline = await prisma.auditLog.findMany({
    where: { propertyId, entityId: { in: timelineEntityIds } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  const actingUser = await getActingUser(propertyId);
  await prisma.auditLog.create({
    data: {
      propertyId,
      userId: actingUser.id,
      entityType: "payment",
      entityId: payment.id,
      action: "chargeback_packet_accessed",
      after: {},
    },
  });

  return {
    generatedAt: new Date(),
    property: {
      name: stay.property.name,
      address: stay.property.address,
      city: stay.property.city,
      state: stay.property.state,
      zip: stay.property.zip,
      phone: stay.property.phone,
    },
    payment: {
      id: payment.id,
      createdAt: payment.createdAt,
      status: payment.status,
      amountRequested: Number(payment.amountRequested),
      amountSettled: payment.amountSettled === null ? null : Number(payment.amountSettled),
      isPreauth: payment.isPreauth,
      preauthCapturedAt: payment.preauthCapturedAt,
      isRefund: payment.refundsPaymentId !== null,
      maskedPan: payment.maskedPan,
      cardBrand: payment.cardBrand,
      entryMode: payment.entryMode,
      authCode: payment.authCode,
      providerRrn: payment.providerRrn,
      providerTransactionId: payment.providerTransactionId,
      // Valor's own words about the authorization — the strongest evidence
      // piece a keyed/manual transaction can offer, since there's no chip
      // cryptogram to point to. On a real production card this is where an
      // AVS/CVV match result would show up.
      authResponseText: extractAuthResponseText(payment.rawResponse),
    },
    guest: {
      name: `${stay.guest.firstName} ${stay.guest.lastName}`,
      address: [stay.guest.addressLine1, stay.guest.city, stay.guest.state, stay.guest.zip].filter(Boolean).join(", "),
      dob: stay.guest.dob,
      phone: stay.guest.phone,
      email: stay.guest.email,
      idType: stay.guest.idType,
      idNumber: stay.guest.idNumberEncrypted ? decrypt(stay.guest.idNumberEncrypted) : null,
      idState: stay.guest.idState,
      idExpiration: stay.guest.idExpiration,
      vehicle: [stay.guest.vehiclePlate, stay.guest.vehicleState, stay.guest.vehicleMake, stay.guest.vehicleModel, stay.guest.vehicleColor]
        .filter(Boolean)
        .join(" "),
    },
    stay: {
      id: stay.id,
      roomNumber: stay.room.roomNumber,
      roomTypeName: stay.room.roomType.name,
      ratePlanName: stay.ratePlan.name,
      checkedInAt: stay.checkedInAt,
      checkedOutAt: stay.checkedOutAt,
      expectedCheckOutAt: stay.expectedCheckOutAt,
      adults: stay.adults,
      children: stay.children,
    },
    folioLines: payment.folio.lines.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      businessDate: l.businessDate,
      type: l.type,
      description: l.description,
      amount: Number(l.amount),
    })),
    payments: payment.folio.payments.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      method: p.method,
      status: p.status,
      amountSettled: p.amountSettled === null ? null : Number(p.amountSettled),
      isRefund: p.refundsPaymentId !== null,
      isDisputed: p.id === payment.id,
    })),
    timeline: timeline.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      userName: t.user.name,
      entityType: t.entityType,
      action: t.action,
    })),
  };
}

export type ChargebackPacket = NonNullable<Awaited<ReturnType<typeof getChargebackPacket>>>;
