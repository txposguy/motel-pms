import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const property = await prisma.property.upsert({
    where: { id: "seed-property-1" },
    update: {
      registrationCardFooterText:
        "By signing below, guest agrees to the property's rules and rates and authorizes the charges listed above.",
    },
    create: {
      id: "seed-property-1",
      name: "Lone Star Inn",
      address: "1400 S Main St",
      city: "Katy",
      state: "TX",
      zip: "77450",
      phone: "(281) 555-0143",
      registrationCardFooterText:
        "By signing below, guest agrees to the property's rules and rates and authorizes the charges listed above.",
    },
  });

  const [single, double] = await Promise.all([
    prisma.roomType.upsert({
      where: { id: "seed-roomtype-single" },
      update: {},
      create: {
        id: "seed-roomtype-single",
        propertyId: property.id,
        name: "Single Queen",
        defaultOccupancy: 2,
        maxOccupancy: 2,
      },
    }),
    prisma.roomType.upsert({
      where: { id: "seed-roomtype-double" },
      update: {},
      create: {
        id: "seed-roomtype-double",
        propertyId: property.id,
        name: "Double Double",
        defaultOccupancy: 4,
        maxOccupancy: 4,
      },
    }),
  ]);

  // "occupied" is never seeded directly — that status should only ever come
  // from a real check-in, otherwise the room rack links to a stay that
  // doesn't exist. Vary clean/dirty/out-of-order for a realistic-looking rack.
  const roomPlan: { number: string; roomTypeId: string; status: "vacant_clean" | "vacant_dirty" | "out_of_order" }[] = [
    { number: "101", roomTypeId: single.id, status: "vacant_clean" },
    { number: "102", roomTypeId: single.id, status: "vacant_clean" },
    { number: "103", roomTypeId: single.id, status: "vacant_dirty" },
    { number: "104", roomTypeId: double.id, status: "vacant_clean" },
    { number: "105", roomTypeId: double.id, status: "vacant_clean" },
    { number: "106", roomTypeId: single.id, status: "out_of_order" },
    { number: "107", roomTypeId: single.id, status: "vacant_clean" },
    { number: "108", roomTypeId: double.id, status: "vacant_clean" },
    { number: "201", roomTypeId: single.id, status: "vacant_clean" },
    { number: "202", roomTypeId: single.id, status: "vacant_clean" },
    { number: "203", roomTypeId: double.id, status: "vacant_dirty" },
    { number: "204", roomTypeId: double.id, status: "vacant_clean" },
  ];

  for (const r of roomPlan) {
    await prisma.room.upsert({
      where: { propertyId_roomNumber: { propertyId: property.id, roomNumber: r.number } },
      // No `update` clause beyond identity fields — re-running the seed must
      // never clobber a room's real, live status (e.g. a guest who is
      // actually checked in) just because it was rerun for unrelated data.
      update: {},
      create: {
        propertyId: property.id,
        roomTypeId: r.roomTypeId,
        roomNumber: r.number,
        floor: r.number.startsWith("2") ? "2" : "1",
        status: r.status,
      },
    });
  }

  const ownerPin = await bcrypt.hash("1234", 10);
  await prisma.user.upsert({
    where: { id: "seed-user-owner" },
    update: {},
    create: {
      id: "seed-user-owner",
      propertyId: property.id,
      name: "Alx Patel",
      role: "owner",
      pinHash: ownerPin,
    },
  });

  const ratePlans: {
    id: string;
    name: string;
    unit: "hourly" | "nightly" | "weekly";
    durationUnits: number;
    baseAmount: number;
  }[] = [
    { id: "seed-rateplan-hourly", name: "4-Hour", unit: "hourly", durationUnits: 4, baseAmount: 35 },
    { id: "seed-rateplan-nightly", name: "Daily Walk-In", unit: "nightly", durationUnits: 1, baseAmount: 65 },
    { id: "seed-rateplan-weekly", name: "Weekly", unit: "weekly", durationUnits: 7, baseAmount: 350 },
  ];

  for (const rp of ratePlans) {
    await prisma.ratePlan.upsert({
      where: { id: rp.id },
      update: {},
      create: {
        id: rp.id,
        propertyId: property.id,
        name: rp.name,
        unit: rp.unit,
        durationUnits: rp.durationUnits,
        baseAmount: rp.baseAmount,
      },
    });
  }

  const taxRules: {
    id: string;
    name: string;
    ratePercent: number;
    appliesTo: "room_charge" | "incidental";
    exemptAfterConsecutiveNights?: number;
  }[] = [
    { id: "seed-tax-state", name: "TX State Hotel Occupancy Tax", ratePercent: 6, appliesTo: "room_charge", exemptAfterConsecutiveNights: 30 },
    { id: "seed-tax-city", name: "Katy Local Hotel Occupancy Tax", ratePercent: 7, appliesTo: "room_charge", exemptAfterConsecutiveNights: 30 },
  ];

  for (const tr of taxRules) {
    await prisma.taxRule.upsert({
      where: { id: tr.id },
      update: {},
      create: {
        id: tr.id,
        propertyId: property.id,
        name: tr.name,
        ratePercent: tr.ratePercent,
        appliesTo: tr.appliesTo,
        exemptAfterConsecutiveNights: tr.exemptAfterConsecutiveNights,
      },
    });
  }

  console.log(
    `Seeded property "${property.name}" with ${roomPlan.length} rooms, ${ratePlans.length} rate plans, and ${taxRules.length} tax rules.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
