import Link from "next/link";
import { getPrimaryProperty, getRoomsForProperty } from "@/lib/data/rooms";
import type { RoomStatus } from "@/generated/prisma/enums";

const STATUS_STYLES: Record<RoomStatus, { label: string; classes: string }> = {
  vacant_clean: {
    label: "Vacant / Clean",
    classes: "bg-green-100 border-green-400 text-green-900",
  },
  vacant_dirty: {
    label: "Vacant / Dirty",
    classes: "bg-yellow-100 border-yellow-400 text-yellow-900",
  },
  occupied: {
    label: "Occupied",
    classes: "bg-blue-100 border-blue-400 text-blue-900",
  },
  out_of_order: {
    label: "Out of Order",
    classes: "bg-gray-200 border-gray-400 text-gray-600",
  },
};

const VACANT_STATUSES: RoomStatus[] = ["vacant_clean", "vacant_dirty"];

export default async function Home() {
  const property = await getPrimaryProperty();

  if (!property) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center text-gray-500">
        No property found. Run <code className="mx-1 rounded bg-gray-100 px-1">npx prisma db seed</code> to load sample data.
      </main>
    );
  }

  const rooms = await getRoomsForProperty(property.id);
  const occupiedCount = rooms.filter((r) => r.status === "occupied").length;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="flex flex-1 flex-col bg-gray-50 dark:bg-gray-950">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{property.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{today}</p>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-300">
          <span>
            <strong className="text-gray-900 dark:text-gray-50">
              {occupiedCount}/{rooms.length}
            </strong>{" "}
            occupied
          </span>
          <span>0 arrivals due</span>
          <span>0 departures due</span>
          <Link
            href="/check-in"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            CHECK IN
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {rooms.map((room) => {
          const style = STATUS_STYLES[room.status];
          const isVacant = VACANT_STATUSES.includes(room.status);
          const tile = (
            <div className={`rounded-lg border-2 p-4 ${style.classes} ${isVacant ? "cursor-pointer transition hover:brightness-95" : ""}`}>
              <div className="text-2xl font-bold">{room.roomNumber}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide">{style.label}</div>
              <div className="mt-2 text-xs opacity-75">{room.roomType.name}</div>
            </div>
          );

          return isVacant ? (
            <Link key={room.id} href={`/check-in?room=${room.id}`}>
              {tile}
            </Link>
          ) : (
            <div key={room.id}>{tile}</div>
          );
        })}
      </div>
    </main>
  );
}
