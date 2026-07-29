import { prisma } from "@/lib/prisma";
import { getActingUser } from "@/lib/data/actingUser";
import bcrypt from "bcryptjs";

export async function getRoomsWithTasks(propertyId: string) {
  const rooms = await prisma.room.findMany({
    where: { propertyId },
    include: {
      roomType: true,
      housekeepingTasks: {
        where: { status: { in: ["pending", "in_progress", "done"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { assignedToUser: true },
      },
    },
    orderBy: { roomNumber: "asc" },
  });
  return rooms;
}

export async function getHousekeepers(propertyId: string) {
  return prisma.user.findMany({
    where: { propertyId, role: "housekeeper", active: true },
    orderBy: { name: "asc" },
  });
}

export async function assignTask(input: { propertyId: string; taskId: string; assignedToUserId: string | null }) {
  const task = await prisma.housekeepingTask.findFirstOrThrow({ where: { id: input.taskId, propertyId: input.propertyId } });
  const actingUser = await getActingUser(input.propertyId);

  const updated = await prisma.housekeepingTask.update({
    where: { id: task.id },
    data: { assignedToUserId: input.assignedToUserId },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: actingUser.id,
      entityType: "housekeeping_task",
      entityId: task.id,
      action: "assign_housekeeping_task",
      after: { assignedToUserId: input.assignedToUserId },
    },
  });

  return updated;
}

export async function markInspected(input: { propertyId: string; taskId: string }) {
  const property = await prisma.property.findUniqueOrThrow({ where: { id: input.propertyId } });
  const task = await prisma.housekeepingTask.findFirstOrThrow({ where: { id: input.taskId, propertyId: input.propertyId } });
  if (task.status !== "done") throw new Error("Only a completed task can be marked inspected.");

  const actingUser = await getActingUser(input.propertyId);

  await prisma.$transaction(async (tx) => {
    await tx.housekeepingTask.update({
      where: { id: task.id },
      data: { status: "inspected" },
    });
    await tx.room.update({
      where: { id: task.roomId },
      data: { status: "vacant_clean" },
    });
    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: actingUser.id,
        entityType: "housekeeping_task",
        entityId: task.id,
        action: "inspect_room",
        after: { inspectionRequired: property.inspectionRequired },
      },
    });
  });
}

// --- Housekeeper PIN identification (mobile PWA) --------------------------
// The desktop screens attribute everything to the owner (see actingUser.ts)
// but the housekeeper view genuinely needs to know *which* housekeeper is
// holding the phone — "my assigned rooms" and correct audit attribution
// both depend on it. This is a narrow PIN check, not a general auth system.

export async function findHousekeeperByPin(propertyId: string, pin: string) {
  const housekeepers = await prisma.user.findMany({ where: { propertyId, role: "housekeeper", active: true } });
  for (const hk of housekeepers) {
    if (await bcrypt.compare(pin, hk.pinHash)) return hk;
  }
  return null;
}

export async function getTasksForHousekeeper(propertyId: string, userId: string) {
  return prisma.housekeepingTask.findMany({
    where: { propertyId, assignedToUserId: userId, status: { in: ["pending", "in_progress"] } },
    include: { room: { include: { roomType: true } } },
    orderBy: { room: { roomNumber: "asc" } },
  });
}

async function assertAssignedToHousekeeper(propertyId: string, taskId: string, userId: string) {
  const task = await prisma.housekeepingTask.findFirstOrThrow({ where: { id: taskId, propertyId } });
  if (task.assignedToUserId !== userId) throw new Error("This room isn't assigned to you.");
  return task;
}

export async function startTask(input: { propertyId: string; taskId: string; userId: string }) {
  const task = await assertAssignedToHousekeeper(input.propertyId, input.taskId, input.userId);
  if (task.status !== "pending") throw new Error("This task has already been started.");

  await prisma.housekeepingTask.update({
    where: { id: task.id },
    data: { status: "in_progress", startedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: input.userId,
      entityType: "housekeeping_task",
      entityId: task.id,
      action: "start_housekeeping_task",
      after: {},
    },
  });
}

export async function completeTask(input: { propertyId: string; taskId: string; userId: string }) {
  const property = await prisma.property.findUniqueOrThrow({ where: { id: input.propertyId } });
  const task = await assertAssignedToHousekeeper(input.propertyId, input.taskId, input.userId);
  if (task.status !== "in_progress") throw new Error("Start this room before marking it done.");

  await prisma.$transaction(async (tx) => {
    await tx.housekeepingTask.update({
      where: { id: task.id },
      data: { status: "done", completedAt: new Date() },
    });
    if (!property.inspectionRequired) {
      await tx.room.update({ where: { id: task.roomId }, data: { status: "vacant_clean" } });
    }
    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: input.userId,
        entityType: "housekeeping_task",
        entityId: task.id,
        action: "complete_housekeeping_task",
        after: { inspectionRequired: property.inspectionRequired },
      },
    });
  });
}

export async function reportProblem(input: { propertyId: string; taskId: string; userId: string; note: string }) {
  const task = await assertAssignedToHousekeeper(input.propertyId, input.taskId, input.userId);

  await prisma.housekeepingTask.update({
    where: { id: task.id },
    data: { notes: `PROBLEM: ${input.note}` },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: input.propertyId,
      userId: input.userId,
      entityType: "housekeeping_task",
      entityId: task.id,
      action: "report_housekeeping_problem",
      after: { note: input.note },
    },
  });
}
