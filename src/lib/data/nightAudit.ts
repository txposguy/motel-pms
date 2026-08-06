import { prisma } from "@/lib/prisma";
import { calculateTax } from "@/lib/tax";
import { getActiveTaxRules } from "@/lib/data/tax";
import { getActingUser } from "@/lib/data/actingUser";
import { decideNightAuditAction } from "@/lib/nightAudit/decide";
import { todaysBusinessDate, formatBusinessDate } from "@/lib/nightAudit/businessDate";

export async function getBusinessDateHistory(propertyId: string, take = 14) {
  return prisma.businessDate.findMany({
    where: { propertyId },
    orderBy: { businessDate: "desc" },
    take,
  });
}

// PRD §4.7 — run once per day, typically after 11pm or before the morning
// shift. Posts nightly/weekly room charges + tax, bumps consecutive-night
// counters, applies the 30-day Texas exemption (§7.2) with its retroactive
// credit, flags overstays, snapshots the day's totals, and closes the
// business date. Must be idempotent and re-runnable if it fails midway —
// achieved here by doing the entire thing in one transaction: any error
// rolls back everything, so nothing partial is ever left committed and a
// retry starts clean. A business date that's already closed refuses to
// run again — corrections from then on post as adjustments on the next
// open date (PRD §4.7 point 6), never by re-running a closed one.
export async function runNightAudit(input: { propertyId: string }) {
  const now = new Date();
  const businessDate = todaysBusinessDate(now);

  const existing = await prisma.businessDate.findUnique({
    where: { propertyId_businessDate: { propertyId: input.propertyId, businessDate } },
  });
  if (existing && existing.status === "closed") {
    throw new Error(`Night audit has already been run and closed for ${formatBusinessDate(businessDate)}.`);
  }

  const actingUser = await getActingUser(input.propertyId);
  const property = await prisma.property.findUniqueOrThrow({ where: { id: input.propertyId } });
  const taxRules = await getActiveTaxRules(input.propertyId, now);
  const roomChargeTaxRules = taxRules.filter((r) => r.appliesTo === "room_charge");
  const exemptionThresholds = roomChargeTaxRules
    .map((r) => r.exemptAfterConsecutiveNights)
    .filter((n): n is number => n !== null && n !== undefined);
  // See decide.ts's exemptAfterConsecutiveNights param comment — the
  // soonest configured threshold wins if more than one HOT rule sets one.
  const exemptAfterConsecutiveNights = exemptionThresholds.length > 0 ? Math.min(...exemptionThresholds) : null;

  const stays = await prisma.stay.findMany({
    where: { propertyId: input.propertyId, status: "in_house" },
    include: {
      guest: true,
      room: true,
      ratePlan: true,
      folio: { include: { lines: true } },
    },
  });

  const totalRooms = await prisma.room.count({ where: { propertyId: input.propertyId } });

  const report = {
    businessDate,
    staysProcessed: [] as Array<{
      stayId: string;
      guestName: string;
      roomNumber: string;
      roomChargePosted: number;
      taxPosted: number;
      newCounter: number;
      exemptionTriggered: boolean;
      retroactiveCredit: number;
    }>,
    overstays: [] as Array<{ stayId: string; guestName: string; roomNumber: string; expectedCheckOutAt: Date }>,
  };

  await prisma.$transaction(
    async (tx) => {
      for (const stay of stays) {
        if (!stay.folio) continue; // shouldn't happen — every stay gets a folio at check-in

        const alreadyChargedToday = stay.folio.lines.some(
          (l) => l.type === "room_charge" && l.businessDate.getTime() === businessDate.getTime()
        );

        const decision = decideNightAuditAction(
          {
            ratePlanUnit: stay.ratePlan.unit,
            ratePlanBaseAmount: Number(stay.ratePlan.baseAmount),
            consecutiveNightsCounter: stay.consecutiveNightsCounter,
            taxExempt: stay.taxExempt,
            alreadyChargedToday,
            expectedCheckOutAt: stay.expectedCheckOutAt,
          },
          exemptAfterConsecutiveNights,
          now
        );

        if (decision.isOverstay) {
          report.overstays.push({
            stayId: stay.id,
            guestName: `${stay.guest.firstName} ${stay.guest.lastName}`,
            roomNumber: stay.room.roomNumber,
            expectedCheckOutAt: stay.expectedCheckOutAt,
          });
        }

        if (decision.skip) continue;

        let roomChargePosted = 0;
        let taxPosted = 0;

        if (decision.postRoomCharge) {
          roomChargePosted = Number(stay.ratePlan.baseAmount);
          await tx.folioLine.create({
            data: {
              folioId: stay.folio.id,
              createdByUserId: actingUser.id,
              type: "room_charge",
              description: `${stay.ratePlan.name} — Room ${stay.room.roomNumber}`,
              amount: roomChargePosted,
              businessDate,
            },
          });
        }

        if (decision.postTaxLines) {
          const taxLines = calculateTax(roomChargePosted, roomChargeTaxRules, "room_charge");
          for (const taxLine of taxLines) {
            taxPosted += taxLine.amount;
            await tx.folioLine.create({
              data: {
                folioId: stay.folio.id,
                createdByUserId: actingUser.id,
                type: "tax",
                description: taxLine.description,
                amount: taxLine.amount,
                taxRuleId: taxLine.taxRuleId,
                businessDate,
              },
            });
          }
        }

        let retroactiveCredit = 0;
        if (decision.triggersExemption && property.retroactiveCreditEnabled) {
          // Every tax line on the folio so far predates this exemption —
          // triggersExemption only fires once, the moment taxExempt flips
          // from false to true (see decide.ts), so there's nothing here
          // from an earlier run to worry about double-crediting.
          const priorTaxLines = stay.folio.lines.filter((l) => l.type === "tax");
          for (const line of priorTaxLines) {
            const credit = -Number(line.amount);
            retroactiveCredit += credit;
            await tx.folioLine.create({
              data: {
                folioId: stay.folio.id,
                createdByUserId: actingUser.id,
                type: "adjustment",
                description: `Tax exemption credit — reverses "${line.description}"`,
                amount: credit,
                taxRuleId: line.taxRuleId,
                voidsLineId: line.id,
                businessDate,
              },
            });
          }
        }

        await tx.stay.update({
          where: { id: stay.id },
          data: {
            consecutiveNightsCounter: decision.newConsecutiveNightsCounter,
            ...(decision.triggersExemption ? { taxExempt: true, taxExemptReason: "permanent_resident_30day" as const } : {}),
          },
        });

        await tx.auditLog.create({
          data: {
            propertyId: input.propertyId,
            userId: actingUser.id,
            entityType: "stay",
            entityId: stay.id,
            action: "night_audit_stay_processed",
            after: {
              businessDate: businessDate.toISOString(),
              roomChargePosted,
              taxPosted,
              newCounter: decision.newConsecutiveNightsCounter,
              exemptionTriggered: decision.triggersExemption,
            },
          },
        });

        if (decision.triggersExemption) {
          await tx.auditLog.create({
            data: {
              propertyId: input.propertyId,
              userId: actingUser.id,
              entityType: "stay",
              entityId: stay.id,
              action: "tax_exemption_triggered",
              after: {
                reason: "permanent_resident_30day",
                consecutiveNights: decision.newConsecutiveNightsCounter,
                retroactiveCreditApplied: property.retroactiveCreditEnabled,
                retroactiveCredit,
              },
            },
          });
        }

        report.staysProcessed.push({
          stayId: stay.id,
          guestName: `${stay.guest.firstName} ${stay.guest.lastName}`,
          roomNumber: stay.room.roomNumber,
          roomChargePosted,
          taxPosted,
          newCounter: decision.newConsecutiveNightsCounter,
          exemptionTriggered: decision.triggersExemption,
          retroactiveCredit,
        });
      }

      // Snapshot totals from what's actually on the ledger for this date,
      // not from the decisions above — folio_lines dated today may also
      // include a same-day check-in's charge, which audit correctly skips
      // posting again but which still belongs in today's numbers.
      const roomChargeSum = await tx.folioLine.aggregate({
        where: { type: "room_charge", businessDate, folio: { stay: { propertyId: input.propertyId } } },
        _sum: { amount: true },
      });
      const taxSum = await tx.folioLine.aggregate({
        where: { type: "tax", businessDate, folio: { stay: { propertyId: input.propertyId } } },
        _sum: { amount: true },
      });
      // Unlike businessDate above, this bounds a real timestamptz column
      // (payments.created_at, not a DATE column) — no Postgres round-trip
      // normalization applies, so local calendar-day boundaries are exactly
      // what's wanted here, computed straight from `now` rather than from
      // the UTC-normalized businessDate.
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const paymentsToday = await tx.payment.findMany({
        where: {
          status: "approved",
          createdAt: { gte: dayStart, lt: dayEnd },
          folio: { stay: { propertyId: input.propertyId } },
        },
        select: { method: true, amountSettled: true },
      });
      const paymentsCash = paymentsToday
        .filter((p) => p.method === "cash" || p.method === "check" || p.method === "other")
        .reduce((sum, p) => sum + Number(p.amountSettled ?? 0), 0);
      const paymentsCard = paymentsToday
        .filter((p) => p.method === "card")
        .reduce((sum, p) => sum + Number(p.amountSettled ?? 0), 0);

      // "Sold" tonight = every in-house stay's room, regardless of billing
      // cadence — an occupied room counts toward occupancy whether it was
      // charged today (nightly/check-in) or not (a weekly guest mid-week).
      const roomsSold = new Set(stays.map((s) => s.roomId)).size;
      const roomRevenue = Number(roomChargeSum._sum.amount ?? 0);
      const taxCollected = Number(taxSum._sum.amount ?? 0);
      const occupancyPercent = totalRooms > 0 ? Math.round((roomsSold / totalRooms) * 10000) / 100 : 0;
      const adr = roomsSold > 0 ? Math.round((roomRevenue / roomsSold) * 100) / 100 : 0;
      const revpar = totalRooms > 0 ? Math.round((roomRevenue / totalRooms) * 100) / 100 : 0;

      const businessDateRow = await tx.businessDate.upsert({
        where: { propertyId_businessDate: { propertyId: input.propertyId, businessDate } },
        create: {
          propertyId: input.propertyId,
          businessDate,
          status: "closed",
          closedByUserId: actingUser.id,
          roomsSold,
          roomRevenue,
          taxCollected,
          paymentsCash,
          paymentsCard,
          occupancyPercent,
          adr,
          revpar,
        },
        update: {
          status: "closed",
          closedAt: now,
          closedByUserId: actingUser.id,
          roomsSold,
          roomRevenue,
          taxCollected,
          paymentsCash,
          paymentsCard,
          occupancyPercent,
          adr,
          revpar,
        },
      });

      await tx.auditLog.create({
        data: {
          propertyId: input.propertyId,
          userId: actingUser.id,
          entityType: "business_date",
          entityId: businessDateRow.id,
          action: "night_audit_closed",
          after: {
            businessDate: businessDate.toISOString(),
            staysProcessed: report.staysProcessed.length,
            overstays: report.overstays.length,
            exemptionsTriggered: report.staysProcessed.filter((s) => s.exemptionTriggered).length,
            roomsSold,
            roomRevenue,
            taxCollected,
            paymentsCash,
            paymentsCard,
            occupancyPercent,
            adr,
            revpar,
          },
        },
      });

      Object.assign(report, {
        roomsSold,
        roomRevenue,
        taxCollected,
        paymentsCash,
        paymentsCard,
        occupancyPercent,
        adr,
        revpar,
      });
    },
    { timeout: 30_000 }
  );

  return report as typeof report & {
    roomsSold: number;
    roomRevenue: number;
    taxCollected: number;
    paymentsCash: number;
    paymentsCard: number;
    occupancyPercent: number;
    adr: number;
    revpar: number;
  };
}

export type NightAuditReport = Awaited<ReturnType<typeof runNightAudit>>;
