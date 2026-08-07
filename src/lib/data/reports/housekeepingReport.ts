import { prisma } from "@/lib/prisma";

export async function getHousekeepingReport(propertyId: string, from: Date, to: Date) {
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  const tasks = await prisma.housekeepingTask.findMany({
    where: {
      propertyId,
      status: { in: ["done", "inspected"] },
      completedAt: { gte: from, lt: toExclusive },
    },
    include: { assignedToUser: true, room: true },
    orderBy: { completedAt: "asc" },
  });

  const byHousekeeper = new Map<string, { name: string; count: number; totalMinutes: number }>();
  for (const task of tasks) {
    const key = task.assignedToUserId ?? "unassigned";
    const name = task.assignedToUser?.name ?? "Unassigned";
    const entry = byHousekeeper.get(key) ?? { name, count: 0, totalMinutes: 0 };
    entry.count += 1;
    if (task.startedAt && task.completedAt) {
      entry.totalMinutes += (task.completedAt.getTime() - task.startedAt.getTime()) / 60000;
    }
    byHousekeeper.set(key, entry);
  }

  return {
    from,
    to,
    byHousekeeper: Array.from(byHousekeeper.values()).map((h) => ({
      name: h.name,
      roomsCleaned: h.count,
      averageMinutes: h.count > 0 ? Math.round(h.totalMinutes / h.count) : 0,
    })),
    totalRoomsCleaned: tasks.length,
  };
}
