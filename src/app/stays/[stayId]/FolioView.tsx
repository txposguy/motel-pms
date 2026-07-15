"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { addChargeAction, extendStayAction, type FolioActionState } from "./actions";
import { formatMoney } from "@/lib/checkin/rate";

type Property = { name: string; address: string; city: string; state: string; zip: string; phone: string };

type Stay = {
  id: string;
  status: string;
  checkedInAt: Date;
  expectedCheckOutAt: Date;
  adults: number;
  children: number;
  guestName: string;
  roomNumber: string;
  roomTypeName: string;
  ratePlanName: string;
  ratePlanUnit: "hourly" | "nightly" | "weekly";
  checkedInByName: string;
};

type FolioLine = {
  id: string;
  createdAt: Date;
  type: string;
  description: string;
  amount: number;
};

type Folio = { id: string; status: string; lines: FolioLine[] };

const initialState: FolioActionState = {};

const TYPE_LABELS: Record<string, string> = {
  room_charge: "Room Charge",
  tax: "Tax",
  incidental: "Incidental",
  adjustment: "Adjustment",
  void: "Void",
};

export function FolioView({
  propertyId,
  property,
  stay,
  folio,
}: {
  propertyId: string;
  property: Property;
  stay: Stay;
  folio: Folio;
}) {
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [addChargeState, addChargeFormAction, addChargePending] = useActionState(addChargeAction, initialState);
  const [extendState, extendFormAction, extendPending] = useActionState(extendStayAction, initialState);

  const balance = folio.lines.reduce((sum, line) => sum + line.amount, 0);
  const extendUnitLabel = stay.ratePlanUnit === "hourly" ? "block" : stay.ratePlanUnit === "weekly" ? "week" : "night";

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="flex items-start justify-between border-b border-gray-200 pb-4">
            <div>
              <h1 className="text-lg font-bold">{property.name}</h1>
              <p className="text-sm text-gray-500">
                {property.address}, {property.city}, {property.state} {property.zip} · {property.phone}
              </p>
            </div>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-800">
              {stay.status === "in_house" ? "In House" : stay.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Guest</div>
              <div>{stay.guestName}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Room</div>
              <div>{stay.roomNumber} — {stay.roomTypeName}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Rate Plan</div>
              <div>{stay.ratePlanName}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Checked In</div>
              <div>{stay.checkedInAt.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Expected Check-Out</div>
              <div>{stay.expectedCheckOutAt.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Occupants</div>
              <div>{stay.adults} adult{stay.adults === 1 ? "" : "s"}{stay.children > 0 && `, ${stay.children} child${stay.children === 1 ? "" : "ren"}`}</div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-semibold text-gray-600">Balance Due</span>
            <span className="text-2xl font-bold">{formatMoney(balance)}</span>
          </div>

          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-1.5">Date</th>
                <th className="py-1.5">Type</th>
                <th className="py-1.5">Description</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {folio.lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-gray-400">No charges yet.</td>
                </tr>
              )}
              {folio.lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-500">{line.createdAt.toLocaleDateString()}</td>
                  <td className="py-1.5 text-gray-500">{TYPE_LABELS[line.type] ?? line.type}</td>
                  <td className="py-1.5">{line.description}</td>
                  <td className={`py-1.5 text-right ${line.amount < 0 ? "text-red-600" : ""}`}>{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="no-print mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddCharge((v) => !v)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            ADD CHARGE
          </button>
          <button
            type="button"
            onClick={() => setShowExtend((v) => !v)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            EXTEND STAY
          </button>
          <button type="button" disabled title="Coming with the payment integration (slice 5)" className="cursor-not-allowed rounded-md bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-500">
            ADD PAYMENT
          </button>
          <button type="button" disabled title="Not built yet" className="cursor-not-allowed rounded-md bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-500">
            MOVE ROOM
          </button>
          <button type="button" disabled title="Not built yet" className="cursor-not-allowed rounded-md bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-500">
            ADJUST
          </button>
          <button type="button" disabled title="Coming in slice 6" className="cursor-not-allowed rounded-md bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-500">
            CHECK OUT
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            PRINT FOLIO
          </button>
          <Link href="/" className="ml-auto text-sm text-gray-500 hover:underline">
            Back to Room Rack
          </Link>
        </div>

        {showAddCharge && (
          <form action={addChargeFormAction} className="no-print mt-3 flex flex-wrap items-end gap-3 rounded-md border border-gray-300 bg-white p-4">
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="stayId" value={stay.id} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Description</span>
              <input name="description" placeholder="Pet fee, extra key, damage…" className="rounded border border-gray-400 px-2 py-1.5 text-sm" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Amount</span>
              <input name="amount" type="number" step="0.01" min="0.01" className="w-28 rounded border border-gray-400 px-2 py-1.5 text-sm" required />
            </label>
            <button type="submit" disabled={addChargePending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              {addChargePending ? "Adding…" : "Add"}
            </button>
            {addChargeState.error && <p className="w-full text-sm font-semibold text-red-600">{addChargeState.error}</p>}
          </form>
        )}

        {showExtend && (
          <form action={extendFormAction} className="no-print mt-3 flex flex-wrap items-end gap-3 rounded-md border border-gray-300 bg-white p-4">
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="stayId" value={stay.id} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Extend by ({extendUnitLabel}s)</span>
              <input name="quantity" type="number" min="1" defaultValue={1} className="w-24 rounded border border-gray-400 px-2 py-1.5 text-sm" required />
            </label>
            <button type="submit" disabled={extendPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              {extendPending ? "Extending…" : "Extend"}
            </button>
            {extendState.error && <p className="w-full text-sm font-semibold text-red-600">{extendState.error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
