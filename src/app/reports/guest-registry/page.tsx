import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getGuestRegistryExport } from "@/lib/data/reports/guestRegistry";
import { parseDateParam, toDateInputValue } from "@/lib/reports/dateParams";
import { PrintButton } from "@/components/PrintButton";

export default async function GuestRegistryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const { from: fromParam, to: toParam } = await searchParams;
  const from = parseDateParam(fromParam, defaultFrom);
  const to = parseDateParam(toParam, today);

  const rows = await getGuestRegistryExport(property.id, from, to);
  const exportQuery = `from=${toDateInputValue(from)}&to=${toDateInputValue(to)}`;

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-3xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Guest Registry Export</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

        <p className="no-print mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Contains unmasked ID numbers. Every time this page — or the CSV export — is opened, that access is written to
          the audit log (PRD §4.8).
        </p>

        <form className="no-print mb-3 flex items-end gap-3 rounded-md border border-gray-300 bg-white p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">From</span>
            <input type="date" name="from" defaultValue={toDateInputValue(from)} className="rounded border border-gray-400 px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">To</span>
            <input type="date" name="to" defaultValue={toDateInputValue(to)} className="rounded border border-gray-400 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            View
          </button>
          <a
            href={`/reports/guest-registry/export?${exportQuery}`}
            className="rounded-md border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Download CSV
          </a>
        </form>

        <div className="printable-card overflow-x-auto rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="border-b border-gray-200 pb-4">
            <h1 className="text-lg font-bold">{property.name}</h1>
            <p className="text-sm text-gray-500">
              Guest Registry — {from.toLocaleDateString()} to {to.toLocaleDateString()} ({rows.length} check-ins)
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">No check-ins in this range.</p>
          ) : (
            <table className="mt-3 w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3">Guest</th>
                  <th className="py-1.5 pr-3">Address</th>
                  <th className="py-1.5 pr-3">ID</th>
                  <th className="py-1.5 pr-3">Vehicle</th>
                  <th className="py-1.5 pr-3">Room</th>
                  <th className="py-1.5 pr-3">Check-In</th>
                  <th className="py-1.5">Check-Out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.stayId} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">{r.guestName}</td>
                    <td className="py-1.5 pr-3">{r.address || "—"}</td>
                    <td className="py-1.5 pr-3">
                      {r.idNumber ? `${r.idType ?? ""} ${r.idNumber} (${r.idState ?? "—"})` : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {r.vehiclePlate ? `${r.vehiclePlate} (${r.vehicleState ?? "—"}) ${r.vehicleMakeModel}` : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{r.roomNumber}</td>
                    <td className="py-1.5 pr-3">{r.checkedInAt.toLocaleString()}</td>
                    <td className="py-1.5">{r.checkedOutAt ? r.checkedOutAt.toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="no-print mt-5 border-t border-gray-200 pt-4">
            <PrintButton />
          </div>
        </div>
      </div>
    </main>
  );
}
