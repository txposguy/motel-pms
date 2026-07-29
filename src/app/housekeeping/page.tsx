import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getRoomsWithTasks, getHousekeepers } from "@/lib/data/housekeeping";
import { HousekeepingBoard } from "./HousekeepingBoard";

export default async function HousekeepingPage() {
  const property = await getPrimaryProperty();

  if (!property) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center text-gray-500">
        No property found. Run <code className="mx-1 rounded bg-gray-100 px-1">npx prisma db seed</code> first.
      </main>
    );
  }

  const [rooms, housekeepers] = await Promise.all([
    getRoomsWithTasks(property.id),
    getHousekeepers(property.id),
  ]);

  return (
    <main className="flex flex-1 flex-col bg-gray-50 dark:bg-gray-950">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Housekeeping</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{property.name}</p>
        </div>
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          Back to Room Rack
        </Link>
      </header>

      <HousekeepingBoard
        propertyId={property.id}
        inspectionRequired={property.inspectionRequired}
        housekeepers={housekeepers.map((h) => ({ id: h.id, name: h.name }))}
        rooms={rooms.map((r) => {
          const task = r.housekeepingTasks[0];
          return {
            id: r.id,
            roomNumber: r.roomNumber,
            roomTypeName: r.roomType.name,
            status: r.status,
            task: task
              ? {
                  id: task.id,
                  type: task.type,
                  status: task.status,
                  assignedToUserId: task.assignedToUserId,
                  assignedToName: task.assignedToUser?.name ?? null,
                  notes: task.notes,
                  startedAt: task.startedAt,
                  completedAt: task.completedAt,
                }
              : null,
          };
        })}
      />
    </main>
  );
}
