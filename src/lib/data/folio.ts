import { prisma } from "@/lib/prisma";
import { calculateTax } from "@/lib/tax";
import { getActiveTaxRules } from "@/lib/data/tax";
import { computeExpectedCheckOut } from "@/lib/checkin/rate";

export async function getStayDetail(stayId: string, propertyId: string) {
  return prisma.stay.findFirst({
    where: { id: stayId, propertyId },
    include: {
      guest: true,
      room: { include: { roomType: true } },
      ratePlan: true,
      checkedInByUser: true,
      folio: {
        include: {
          lines: { orderBy: { createdAt: "desc" }, include: { taxRule: true } },
          payments: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
}

async function getActingUser(propertyId: string) {
  return prisma.user.findFirstOrThrow({ where: { propertyId, role: "owner" } });
}

export async function addIncidentalCharge(input: {
  propertyId: string;
  stayId: string;
  description: string;
  amount: number;
}) {
  const stay = await prisma.stay.findFirstOrThrow({
    where: { id: input.stayId, propertyId: input.propertyId },
    include: { folio: true },
  });
  if (!stay.folio) throw new Error("This stay has no open folio.");
  if (stay.folio.status !== "open") throw new Error("This folio is closed.");

  const actingUser = await getActingUser(input.propertyId);
  const businessDate = new Date(new Date().toDateString());
  const taxRules = await getActiveTaxRules(input.propertyId, new Date());
  const taxLines = calculateTax(input.amount, taxRules, "incidental");

  await prisma.$transaction(async (tx) => {
    await tx.folioLine.create({
      data: {
        folioId: stay.folio!.id,
        createdByUserId: actingUser.id,
        type: "incidental",
        description: input.description,
        amount: input.amount,
        businessDate,
      },
    });

    for (const taxLine of taxLines) {
      await tx.folioLine.create({
        data: {
          folioId: stay.folio!.id,
          createdByUserId: actingUser.id,
          type: "tax",
          description: taxLine.description,
          amount: taxLine.amount,
          taxRuleId: taxLine.taxRuleId,
          businessDate,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: actingUser.id,
        entityType: "folio",
        entityId: stay.folio!.id,
        action: "add_incidental_charge",
        after: { description: input.description, amount: input.amount },
      },
    });
  });
}

export async function extendStay(input: {
  propertyId: string;
  stayId: string;
  quantity: number;
}) {
  if (input.quantity < 1) throw new Error("Extension quantity must be at least 1.");

  const stay = await prisma.stay.findFirstOrThrow({
    where: { id: input.stayId, propertyId: input.propertyId },
    include: { folio: true, ratePlan: true, room: true, property: true },
  });
  if (stay.status !== "in_house") throw new Error("Only an in-house stay can be extended.");
  if (!stay.folio) throw new Error("This stay has no open folio.");
  if (stay.folio.status !== "open") throw new Error("This folio is closed.");

  const actingUser = await getActingUser(input.propertyId);
  const businessDate = new Date(new Date().toDateString());
  const taxRules = await getActiveTaxRules(input.propertyId, new Date());

  const extensionAmount = Number(stay.ratePlan.baseAmount) * input.quantity;
  const taxLines = calculateTax(extensionAmount, taxRules, "room_charge");

  let newExpectedCheckOutAt = stay.expectedCheckOutAt;
  for (let i = 0; i < input.quantity; i++) {
    newExpectedCheckOutAt = computeExpectedCheckOut(
      { unit: stay.ratePlan.unit, durationUnits: stay.ratePlan.durationUnits },
      newExpectedCheckOutAt,
      stay.property.checkOutTime
    );
  }

  const unitLabel = stay.ratePlan.unit === "hourly" ? "block" : stay.ratePlan.unit === "weekly" ? "week" : "night";
  const description =
    input.quantity === 1
      ? `${stay.ratePlan.name} — Room ${stay.room.roomNumber} (extended)`
      : `${stay.ratePlan.name} — Room ${stay.room.roomNumber} (extended × ${input.quantity} ${unitLabel}s)`;

  await prisma.$transaction(async (tx) => {
    await tx.folioLine.create({
      data: {
        folioId: stay.folio!.id,
        createdByUserId: actingUser.id,
        type: "room_charge",
        description,
        amount: extensionAmount,
        businessDate,
      },
    });

    for (const taxLine of taxLines) {
      await tx.folioLine.create({
        data: {
          folioId: stay.folio!.id,
          createdByUserId: actingUser.id,
          type: "tax",
          description: taxLine.description,
          amount: taxLine.amount,
          taxRuleId: taxLine.taxRuleId,
          businessDate,
        },
      });
    }

    await tx.stay.update({
      where: { id: stay.id },
      data: { expectedCheckOutAt: newExpectedCheckOutAt },
    });

    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: actingUser.id,
        entityType: "stay",
        entityId: stay.id,
        action: "extend_stay",
        after: {
          quantity: input.quantity,
          newExpectedCheckOutAt: newExpectedCheckOutAt.toISOString(),
        },
      },
    });
  });
}
