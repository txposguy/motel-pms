import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getTaxReport } from "@/lib/data/reports/taxReport";
import { parseBusinessDateParam, toBusinessDateInputValue } from "@/lib/reports/dateParams";
import { formatBusinessDate, todaysBusinessDate } from "@/lib/nightAudit/businessDate";
import { formatMoney } from "@/lib/checkin/rate";
import { PrintButton } from "@/components/PrintButton";

const REASON_LABELS: Record<string, string> = {
  permanent_resident_30day: "30-Day Permanent Resident (Texas)",
  government: "Government",
  nonprofit: "Nonprofit",
  other: "Other",
};

export default async function TaxReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const today = todaysBusinessDate(new Date());
  const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const { from: fromParam, to: toParam } = await searchParams;
  const from = parseBusinessDateParam(fromParam, defaultFrom);
  const to = parseBusinessDateParam(toParam, today);

  const report = await getTaxReport(property.id, from, to);

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Tax Report</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

        <form className="no-print mb-3 flex items-end gap-3 rounded-md border border-gray-300 bg-white p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">From</span>
            <input type="date" name="from" defaultValue={toBusinessDateInputValue(from)} className="rounded border border-gray-400 px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">To</span>
            <input type="date" name="to" defaultValue={toBusinessDateInputValue(to)} className="rounded border border-gray-400 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            View
          </button>
        </form>

        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="border-b border-gray-200 pb-4">
            <h1 className="text-lg font-bold">{property.name}</h1>
            <p className="text-sm text-gray-500">
              Tax Report — {formatBusinessDate(report.from)} to {formatBusinessDate(report.to)}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <Stat label="Taxable Revenue" value={formatMoney(report.taxableRevenue)} />
            <Stat label="Exempt Revenue" value={formatMoney(report.exemptRevenue)} />
            <Stat label="Total Tax Collected" value={formatMoney(report.totalTaxCollected)} />
          </div>

          <div className="mt-5 border-t border-gray-200 pt-3 text-sm font-semibold text-gray-600">Tax Collected by Rule</div>
          {report.byRule.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No tax activity in this range.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">Rule</th>
                  <th className="py-1.5 text-right">Rate</th>
                  <th className="py-1.5 text-right">Collected (net of credits)</th>
                </tr>
              </thead>
              <tbody>
                {report.byRule.map((r) => (
                  <tr key={r.name} className="border-b border-gray-100">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right">{r.ratePercent}%</td>
                    <td className="py-1.5 text-right">{formatMoney(r.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-5 border-t border-gray-200 pt-3 text-sm font-semibold text-gray-600">
            Exemptions Granted ({report.exemptions.length})
          </div>
          {report.exemptions.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No exemptions triggered in this range.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5">Room</th>
                  <th className="py-1.5">Guest</th>
                  <th className="py-1.5">Reason</th>
                  <th className="py-1.5 text-right">Retroactive Credit</th>
                </tr>
              </thead>
              <tbody>
                {report.exemptions.map((e) => (
                  <tr key={e.stayId + e.triggeredAt.toISOString()} className="border-b border-gray-100">
                    <td className="py-1.5">{e.triggeredAt.toLocaleDateString()}</td>
                    <td className="py-1.5">{e.roomNumber}</td>
                    <td className="py-1.5">{e.guestName}</td>
                    <td className="py-1.5">{REASON_LABELS[e.reason] ?? e.reason}</td>
                    <td className="py-1.5 text-right">{formatMoney(e.retroactiveCredit)}</td>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}
