import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getShiftReport } from "@/lib/data/reports/shift";
import { parseDateParam, toDateInputValue } from "@/lib/reports/dateParams";
import { formatMoney } from "@/lib/checkin/rate";
import { PrintButton } from "@/components/PrintButton";

export default async function ShiftReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const { from: fromParam, to: toParam } = await searchParams;
  const from = parseDateParam(fromParam, today);
  const to = parseDateParam(toParam, today);

  const report = await getShiftReport(property.id, from, to);
  const totalCash = Math.round(report.byUser.reduce((sum, u) => sum + u.cash, 0) * 100) / 100;
  const totalCard = Math.round(report.byUser.reduce((sum, u) => sum + u.card, 0) * 100) / 100;

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Shift Report</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

        <p className="no-print mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          This is a cash/card summary per user, not a true drawer reconciliation — there&apos;s no clock-in/out or
          counted-cash entry in the app yet, so &quot;cash in drawer&quot; and over/short can&apos;t be computed. Ask
          the owner if that&apos;s worth building before relying on this for drawer counts.
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
        </form>

        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="border-b border-gray-200 pb-4">
            <h1 className="text-lg font-bold">{property.name}</h1>
            <p className="text-sm text-gray-500">
              Shift Report — {from.toLocaleDateString()} to {to.toLocaleDateString()}
            </p>
          </div>

          {report.byUser.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">No approved payments in this range.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">User</th>
                  <th className="py-1.5 text-right">Cash/Check/Other</th>
                  <th className="py-1.5 text-right">Card</th>
                  <th className="py-1.5 text-right">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {report.byUser.map((u) => (
                  <tr key={u.name} className="border-b border-gray-100">
                    <td className="py-1.5">{u.name}</td>
                    <td className="py-1.5 text-right">{formatMoney(u.cash)}</td>
                    <td className="py-1.5 text-right">{formatMoney(u.card)}</td>
                    <td className="py-1.5 text-right">{u.transactionCount}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 text-right font-semibold text-gray-600">Total</td>
                  <td className="py-1.5 text-right font-bold">{formatMoney(totalCash)}</td>
                  <td className="py-1.5 text-right font-bold">{formatMoney(totalCard)}</td>
                  <td></td>
                </tr>
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
