import { prisma } from "@/lib/prisma";
import { getActingUser } from "@/lib/data/actingUser";
import { capturePreAuth } from "@/lib/data/payments";
import { computeBalance } from "@/lib/folio/balance";

export async function checkOutStay(input: {
  propertyId: string;
  stayId: string;
  override: boolean;
  overrideReason?: string;
}) {
  const stay = await prisma.stay.findFirstOrThrow({
    where: { id: input.stayId, propertyId: input.propertyId },
    include: { folio: { include: { payments: true } } },
  });

  if (stay.status !== "in_house") throw new Error("This stay is not in-house.");
  if (!stay.folio) throw new Error("This stay has no folio.");
  if (stay.folio.status !== "open") throw new Error("This folio is already closed.");

  const actingUser = await getActingUser(input.propertyId);

  // Resolve any open pre-authorization before settling the balance (PRD
  // §4.5 step 3) — capture it for its full authorized amount.
  const openPreauth = stay.folio.payments.find((p) => p.isPreauth && p.status === "approved" && !p.preauthCapturedAt);
  if (openPreauth) {
    await capturePreAuth({ propertyId: input.propertyId, paymentId: openPreauth.id });
  }

  const folio = await prisma.folio.findUniqueOrThrow({
    where: { id: stay.folio.id },
    include: { lines: true, payments: true },
  });
  const charges = folio.lines.reduce((sum, line) => sum + Number(line.amount), 0);
  const balance = computeBalance(
    charges,
    folio.payments.map((p) => ({
      status: p.status,
      isPreauth: p.isPreauth,
      preauthCapturedAt: p.preauthCapturedAt,
      amountSettled: p.amountSettled === null ? null : Number(p.amountSettled),
    }))
  );

  if (balance > 0) {
    if (!input.override) {
      throw new Error(`Balance of $${balance.toFixed(2)} must be paid before check-out — take a payment or use the owner override.`);
    }
    if (!input.overrideReason?.trim()) {
      throw new Error("Enter a reason for checking out with a balance due.");
    }
  }

  const now = new Date();
  const businessDate = new Date(now.toDateString());

  await prisma.$transaction(async (tx) => {
    await tx.stay.update({
      where: { id: stay.id },
      data: { checkedOutAt: now, status: "checked_out", checkedOutByUserId: actingUser.id },
    });

    await tx.folio.update({
      where: { id: folio.id },
      data: { status: "closed", closedAt: now },
    });

    await tx.room.update({
      where: { id: stay.roomId },
      data: { status: "vacant_dirty" },
    });

    await tx.housekeepingTask.create({
      data: {
        propertyId: input.propertyId,
        roomId: stay.roomId,
        businessDate,
        type: "departure_clean",
      },
    });

    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: actingUser.id,
        entityType: "stay",
        entityId: stay.id,
        action: "check_out",
        after: { balance, override: input.override, overrideReason: input.overrideReason || null },
      },
    });
  });
}
