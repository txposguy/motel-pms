import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const property = await prisma.property.upsert({
    where: { id: "seed-property-1" },
    update: {},
    create: {
      id: "seed-property-1",
      name: "Lone Star Inn",
      address: "1400 S Main St",
      city: "Katy",
      state: "TX",
      zip: "77450",
      phone: "(281) 555-0143",
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

  const roomPlan: { number: string; roomTypeId: string; status: "vacant_clean" | "vacant_dirty" | "occupied" | "out_of_order" }[] = [
    { number: "101", roomTypeId: single.id, status: "occupied" },
    { number: "102", roomTypeId: single.id, status: "vacant_clean" },
    { number: "103", roomTypeId: single.id, status: "vacant_dirty" },
    { number: "104", roomTypeId: double.id, status: "occupied" },
    { number: "105", roomTypeId: double.id, status: "vacant_clean" },
    { number: "106", roomTypeId: single.id, status: "out_of_order" },
    { number: "107", roomTypeId: single.id, status: "occupied" },
    { number: "108", roomTypeId: double.id, status: "vacant_clean" },
    { number: "201", roomTypeId: single.id, status: "vacant_clean" },
    { number: "202", roomTypeId: single.id, status: "occupied" },
    { number: "203", roomTypeId: double.id, status: "vacant_dirty" },
    { number: "204", roomTypeId: double.id, status: "vacant_clean" },
  ];

  for (const r of roomPlan) {
    await prisma.room.upsert({
      where: { propertyId_roomNumber: { propertyId: property.id, roomNumber: r.number } },
      update: { status: r.status },
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

  console.log(`Seeded property "${property.name}" with ${roomPlan.length} rooms.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
