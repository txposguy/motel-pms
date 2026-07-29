"use client";

import { useActionState } from "react";
import { assignTaskAction, markInspectedAction, type HousekeepingActionState } from "./actions";

type Room = {
  id: string;
  roomNumber: string;
  roomTypeName: string;
  status: string;
  task: {
    id: string;
    type: string;
    status: string;
    assignedToUserId: string | null;
    assignedToName: string | null;
    notes: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
  } | null;
};

type Housekeeper = { id: string; name: string };

const ROOM_STATUS_STYLES: Record<string, string> = {
  vacant_clean: "bg-green-100 text-green-800",
  vacant_dirty: "bg-yellow-100 text-yellow-800",
  occupied: "bg-blue-100 text-blue-800",
  out_of_order: "bg-gray-200 text-gray-600",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  departure_clean: "Departure Clean",
  stayover: "Stayover",
  deep_clean: "Deep Clean",
  inspection: "Inspection",
};

const TASK_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-amber-100 text-amber-800",
  inspected: "bg-green-100 text-green-800",
};

const initialState: HousekeepingActionState = {};

function AssignSelect({ propertyId, taskId, housekeepers, currentUserId }: { propertyId: string; taskId: string; housekeepers: Housekeeper[]; currentUserId: string | null }) {
  const [state, formAction] = useActionState(assignTaskAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="taskId" value={taskId} />
      <select
        name="assignedToUserId"
        defaultValue={currentUserId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="">Unassigned</option>
        {housekeepers.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      {state.error && <p className="mt-1 text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}

function InspectButton({ propertyId, taskId }: { propertyId: string; taskId: string }) {
  const [state, formAction, pending] = useActionState(markInspectedAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-green-600 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
      >
        {pending ? "Marking…" : "Mark Inspected"}
      </button>
      {state.error && <p className="mt-1 text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}

export function HousekeepingBoard({
  propertyId,
  inspectionRequired,
  housekeepers,
  rooms,
}: {
  propertyId: string;
  inspectionRequired: boolean;
  housekeepers: Housekeeper[];
  rooms: Room[];
}) {
  return (
    <div className="p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <th className="py-2">Room</th>
            <th className="py-2">Status</th>
            <th className="py-2">Task</th>
            <th className="py-2">Task Status</th>
            <th className="py-2">Assigned To</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id} className="border-b border-gray-100">
              <td className="py-2 font-semibold">{room.roomNumber} <span className="font-normal text-gray-400">— {room.roomTypeName}</span></td>
              <td className="py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${ROOM_STATUS_STYLES[room.status] ?? ""}`}>
                  {room.status.replace("_", " / ")}
                </span>
              </td>
              <td className="py-2 text-gray-600">{room.task ? TASK_TYPE_LABELS[room.task.type] ?? room.task.type : "—"}</td>
              <td className="py-2">
                {room.task ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${TASK_STATUS_STYLES[room.task.status] ?? ""}`}>
                    {room.task.status.replace("_", " ")}
                  </span>
                ) : (
                  "—"
                )}
                {room.task?.notes?.startsWith("PROBLEM:") && (
                  <div className="mt-1 text-xs font-semibold text-red-600">⚠ {room.task.notes.replace("PROBLEM: ", "")}</div>
                )}
              </td>
              <td className="py-2">
                {room.task ? (
                  <AssignSelect propertyId={propertyId} taskId={room.task.id} housekeepers={housekeepers} currentUserId={room.task.assignedToUserId} />
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2">
                {inspectionRequired && room.task?.status === "done" && (
                  <InspectButton propertyId={propertyId} taskId={room.task.id} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
