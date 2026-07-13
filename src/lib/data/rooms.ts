import { prisma } from "@/lib/prisma";

export async function getPrimaryProperty() {
  return prisma.property.findFirst({
    orderBy: { createdAt: "asc" },
  });
}

export async function getRoomsForProperty(propertyId: string) {
  return prisma.room.findMany({
    where: { propertyId },
    include: { roomType: true },
    orderBy: { roomNumber: "asc" },
  });
}
