import type { Metadata, Viewport } from "next";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getTasksForHousekeeper } from "@/lib/data/housekeeping";
import { getHousekeeperSession } from "@/lib/housekeeping/session";
import { PinEntry } from "./PinEntry";
import { TaskList } from "./TaskList";

export const metadata: Metadata = {
  title: "Housekeeping",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1d4ed8",
};

export default async function HousekeeperMobilePage() {
  const property = await getPrimaryProperty();

  if (!property) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-center text-gray-400">
        No property found.
      </main>
    );
  }

  const housekeeper = await getHousekeeperSession(property.id);

  if (!housekeeper) {
    return <PinEntry propertyId={property.id} />;
  }

  const tasks = await getTasksForHousekeeper(property.id, housekeeper.id);

  return (
    <TaskList
      propertyId={property.id}
      housekeeperName={housekeeper.name}
      tasks={tasks.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        roomNumber: t.room.roomNumber,
        roomTypeName: t.room.roomType.name,
        notes: t.notes,
      }))}
    />
  );
}
