import { prisma } from "@/lib/prisma";

// Stand-in until PIN-based clerk sessions exist — every action is
// attributed to the property's owner. See CLAUDE.md known gaps.
export async function getActingUser(propertyId: string) {
  return prisma.user.findFirstOrThrow({ where: { propertyId, role: "owner" } });
}
