"use client";

import { useActionState } from "react";
import Link from "next/link";
import { runNightAuditAction, type NightAuditActionState } from "./actions";
import { formatMoney } from "@/lib/checkin/rate";
import { formatBusinessDate } from "@/lib/nightAudit/businessDate";

type HistoryRow = {
  id: string;
  businessDate: Date;
  status: string;
  roomsSold: number;
  roomRevenue: number;
  taxCollected: number;
  occupancyPercent: number;
  adr: number;
  revpar: number;
};

const initialState: NightAuditActionState = {};

export function NightAuditView({
  propertyId,
  propertyName,
  history,
}: {
  propertyId: string;
  propertyName: string;
  history: HistoryRow[];
}) {
  const [state, formAction, pending] = useActionState(runNightAuditAction, initialState);
  const report = state.report;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Night Audit</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{propertyName} · {today}</p>
          </div>
          <Link href="/" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Room Rack
          </Link>
        </div>

        {!report && (
          <div className="no-print rounded-lg border border-gray-300 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Posts tonight&apos;s room charges and tax, bumps each guest&apos;s consecutive-night count, applies the 30-day
              tax exemption where it kicks in, flags overdue check-outs, and closes tonight&apos;s business date. This
              can&apos;t be undone once it runs — corrections after this post as adjustments on the next open date.
            </p>
            <form action={formAction} className="mt-4">
              <input type="hidden" name="propertyId" value={propertyId} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {pending ? "Running…" : "RUN NIGHT AUDIT"}
              </button>
            </form>
            {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
          </div>
        )}

        {report && (
          <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
            <div className="flex items-start justify-between border-b border-gray-200 pb-4">
              <div>
                <h1 className="text-lg font-bold">{propertyName}</h1>
                <p className="text-sm text-gray-500">Night Audit Report</p>
              </div>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-800">
                Closed — {formatBusinessDate(new Date(report.businessDate))}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Rooms Sold" value={String(report.roomsSold)} />
              <Stat label="Occupancy" value={`${report.occupancyPercent}%`} />
              <Stat label="Room Revenue" value={formatMoney(report.roomRevenue)} />
              <Stat label="Tax Collected" value={formatMoney(report.taxCollected)} />
              <Stat label="ADR" value={formatMoney(report.adr)} />
              <Stat label="RevPAR" value={formatMoney(report.revpar)} />
              <Stat label="Cash/Check/Other" value={formatMoney(report.paymentsCash)} />
              <Stat label="Card" value={formatMoney(report.paymentsCard)} />
            </div>

            <div className="mt-5 border-t border-gray-200 pt-3 text-sm font-semibold text-gray-600">
              Stays Processed ({report.staysProcessed.length})
            </div>
            {report.staysProcessed.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No in-house nightly or weekly stays needed posting tonight.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="py-1.5">Room</th>
                    <th className="py-1.5">Guest</th>
                    <th className="py-1.5 text-right">Charge</th>
                    <th className="py-1.5 text-right">Tax</th>
                    <th className="py-1.5 text-right">Nights</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {report.staysProcessed.map((s) => (
                    <tr key={s.stayId} className="border-b border-gray-100">
                      <td className="py-1.5">{s.roomNumber}</td>
                      <td className="py-1.5">{s.guestName}</td>
                      <td className="py-1.5 text-right">{s.roomChargePosted > 0 ? formatMoney(s.roomChargePosted) : "—"}</td>
                      <td className="py-1.5 text-right">{s.taxPosted > 0 ? formatMoney(s.taxPosted) : "—"}</td>
                      <td className="py-1.5 text-right">{s.newCounter}</td>
                      <td className="py-1.5 text-right">
                        {s.exemptionTriggered && (
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-700">
                            30-day exempt · credited {formatMoney(s.retroactiveCredit)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-5 border-t border-gray-200 pt-3 text-sm font-semibold text-gray-600">
              Overstays ({report.overstays.length})
            </div>
            {report.overstays.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No overdue check-outs.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {report.overstays.map((o) => (
                  <li key={o.stayId} className="flex justify-between rounded bg-amber-50 px-2 py-1">
                    <span>Room {o.roomNumber} — {o.guestName}</span>
                    <span className="text-amber-700">expected {new Date(o.expectedCheckOutAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="no-print mt-5 flex gap-3 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                PRINT REPORT
              </button>
              <Link href="/" className="ml-auto text-sm text-gray-500 hover:underline">
                Back to Room Rack
              </Link>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="no-print mt-6 rounded-lg border border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="text-sm font-semibold text-gray-600 dark:text-gray-300">Recent Business Dates</div>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700">
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5">Status</th>
                  <th className="py-1.5 text-right">Rooms Sold</th>
                  <th className="py-1.5 text-right">Occupancy</th>
                  <th className="py-1.5 text-right">Room Revenue</th>
                  <th className="py-1.5 text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5">{formatBusinessDate(h.businessDate)}</td>
                    <td className="py-1.5 capitalize">{h.status}</td>
                    <td className="py-1.5 text-right">{h.roomsSold}</td>
                    <td className="py-1.5 text-right">{h.occupancyPercent}%</td>
                    <td className="py-1.5 text-right">{formatMoney(h.roomRevenue)}</td>
                    <td className="py-1.5 text-right">{formatMoney(h.taxCollected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}
