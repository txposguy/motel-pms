import { prisma } from "@/lib/prisma";

// Reservations are "thin in v1" (PRD §3.2 — most business is walk-in), so
// there's no meaningful "expected arrivals" data source distinct from who
// actually walked in. This report covers what the data can actually answer:
// who arrived today, who's expected to leave today, and who actually left.
export async function getArrivalsDepartures(propertyId: string, date: Date) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [arrivals, expectedDepartures, actualDepartures] = await Promise.all([
    prisma.stay.findMany({
      where: { propertyId, checkedInAt: { gte: dayStart, lt: dayEnd } },
      include: { guest: true, room: true, ratePlan: true },
      orderBy: { checkedInAt: "asc" },
    }),
    prisma.stay.findMany({
      where: { propertyId, status: "in_house", expectedCheckOutAt: { gte: dayStart, lt: dayEnd } },
      include: { guest: true, room: true, ratePlan: true },
      orderBy: { expectedCheckOutAt: "asc" },
    }),
    prisma.stay.findMany({
      where: { propertyId, status: "checked_out", checkedOutAt: { gte: dayStart, lt: dayEnd } },
      include: { guest: true, room: true, ratePlan: true },
      orderBy: { checkedOutAt: "asc" },
    }),
  ]);

  const mapStay = (s: (typeof arrivals)[number]) => ({
    stayId: s.id,
    guestName: `${s.guest.firstName} ${s.guest.lastName}`,
    roomNumber: s.room.roomNumber,
    ratePlanName: s.ratePlan.name,
    checkedInAt: s.checkedInAt,
    expectedCheckOutAt: s.expectedCheckOutAt,
    checkedOutAt: s.checkedOutAt,
  });

  return {
    date: dayStart,
    arrivals: arrivals.map(mapStay),
    expectedDepartures: expectedDepartures.map(mapStay),
    actualDepartures: actualDepartures.map(mapStay),
  };
}
