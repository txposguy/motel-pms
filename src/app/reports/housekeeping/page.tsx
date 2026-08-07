import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getHousekeepingReport } from "@/lib/data/reports/housekeepingReport";
import { parseDateParam, toDateInputValue } from "@/lib/reports/dateParams";
import { PrintButton } from "@/components/PrintButton";

export default async function HousekeepingReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const defaultFrom = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const { from: fromParam, to: toParam } = await searchParams;
  const from = parseDateParam(fromParam, defaultFrom);
  const to = parseDateParam(toParam, today);

  const report = await getHousekeepingReport(property.id, from, to);

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Housekeeping</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

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
        </form>

        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="border-b border-gray-200 pb-4">
            <h1 className="text-lg font-bold">{property.name}</h1>
            <p className="text-sm text-gray-500">
              Housekeeping — {from.toLocaleDateString()} to {to.toLocaleDateString()}
            </p>
          </div>

          <p className="mt-3 text-sm text-gray-500">{report.totalRoomsCleaned} rooms cleaned total.</p>

          {report.byHousekeeper.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No completed housekeeping tasks in this range.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">Housekeeper</th>
                  <th className="py-1.5 text-right">Rooms Cleaned</th>
                  <th className="py-1.5 text-right">Avg. Time</th>
                </tr>
              </thead>
              <tbody>
                {report.byHousekeeper.map((h) => (
                  <tr key={h.name} className="border-b border-gray-100">
                    <td className="py-1.5">{h.name}</td>
                    <td className="py-1.5 text-right">{h.roomsCleaned}</td>
                    <td className="py-1.5 text-right">{h.averageMinutes} min</td>
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
