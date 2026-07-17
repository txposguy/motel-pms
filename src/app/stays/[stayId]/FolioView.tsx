"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  addChargeAction,
  extendStayAction,
  reconcilePaymentAction,
  takePaymentAction,
  type FolioActionState,
} from "./actions";
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

type Payment = {
  id: string;
  createdAt: Date;
  method: string;
  amountRequested: number;
  amountSettled: number | null;
  status: string;
  cardBrand: string | null;
  maskedPan: string | null;
};

type Folio = { id: string; status: string; lines: FolioLine[]; payments: Payment[] };

const initialState: FolioActionState = {};

const TYPE_LABELS: Record<string, string> = {
  room_charge: "Room Charge",
  tax: "Tax",
  incidental: "Incidental",
  adjustment: "Adjustment",
  void: "Void",
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  declined: "bg-red-100 text-red-800",
  voided: "bg-gray-100 text-gray-600",
  refunded: "bg-gray-100 text-gray-600",
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
  const [showPayment, setShowPayment] = useState(false);
  const [addChargeState, addChargeFormAction, addChargePending] = useActionState(addChargeAction, initialState);
  const [extendState, extendFormAction, extendPending] = useActionState(extendStayAction, initialState);
  const [payState, payFormAction, payPending] = useActionState(takePaymentAction, initialState);
  const [reconcileState, reconcileFormAction, reconcilePending] = useActionState(reconcilePaymentAction, initialState);

  const charges = folio.lines.reduce((sum, line) => sum + line.amount, 0);
  const paid = folio.payments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + (p.amountSettled ?? 0), 0);
  const balance = charges - paid;
  const hasPendingPayment = folio.payments.some((p) => p.status === "pending");
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
          {hasPendingPayment && (
            <p className="mt-1 text-sm font-semibold text-amber-600">
              ⚠ Payment status unknown for one or more attempts — check the terminal screen, then use RECONCILE below.
            </p>
          )}

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

          {folio.payments.length > 0 && (
            <>
              <div className="mt-5 border-t border-gray-200 pt-3 text-sm font-semibold text-gray-600">Payments</div>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="py-1.5">Date</th>
                    <th className="py-1.5">Method</th>
                    <th className="py-1.5">Status</th>
                    <th className="py-1.5 text-right">Amount</th>
                    <th className="no-print py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {folio.payments.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-500">{p.createdAt.toLocaleString()}</td>
                      <td className="py-1.5 capitalize">
                        {p.method}
                        {p.cardBrand && p.maskedPan && <span className="text-gray-400"> · {p.cardBrand} {p.maskedPan.slice(-4)}</span>}
                      </td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${PAYMENT_STATUS_STYLES[p.status] ?? ""}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">{formatMoney(p.amountSettled ?? p.amountRequested)}</td>
                      <td className="no-print py-1.5 text-right">
                        {p.status === "pending" && (
                          <form action={reconcileFormAction} className="inline">
                            <input type="hidden" name="propertyId" value={propertyId} />
                            <input type="hidden" name="stayId" value={stay.id} />
                            <input type="hidden" name="paymentId" value={p.id} />
                            <button
                              type="submit"
                              disabled={reconcilePending}
                              className="rounded border border-amber-500 px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              {reconcilePending ? "Checking…" : "RECONCILE"}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reconcileState.error && <p className="no-print mt-1 text-sm font-semibold text-red-600">{reconcileState.error}</p>}
            </>
          )}
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
          <button
            type="button"
            onClick={() => setShowPayment((v) => !v)}
            disabled={balance <= 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
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

        {showPayment && (
          <form action={payFormAction} className="no-print mt-3 flex flex-wrap items-end gap-3 rounded-md border border-gray-300 bg-white p-4">
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="stayId" value={stay.id} />
            <input type="hidden" name="folioId" value={folio.id} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Method</span>
              <select name="method" defaultValue="card" className="rounded border border-gray-400 px-2 py-1.5 text-sm">
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Amount</span>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={balance > 0 ? balance.toFixed(2) : undefined}
                className="w-28 rounded border border-gray-400 px-2 py-1.5 text-sm"
                required
              />
            </label>
            <button type="submit" disabled={payPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              {payPending ? "Processing…" : "Take Payment"}
            </button>
            {payState.error && <p className="w-full text-sm font-semibold text-red-600">{payState.error}</p>}
          </form>
        )}

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
