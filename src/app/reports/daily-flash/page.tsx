import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getDailyFlash } from "@/lib/data/reports/dailyFlash";
import { getBusinessDateHistory } from "@/lib/data/nightAudit";
import { formatBusinessDate } from "@/lib/nightAudit/businessDate";
import { parseBusinessDateParam, toBusinessDateInputValue } from "@/lib/reports/dateParams";
import { formatMoney } from "@/lib/checkin/rate";
import { PrintButton } from "@/components/PrintButton";

export default async function DailyFlashPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const { date: dateParam } = await searchParams;
  const history = await getBusinessDateHistory(property.id);
  const businessDate = dateParam ? parseBusinessDateParam(dateParam, history[0]?.businessDate) : undefined;
  const report = await getDailyFlash(property.id, businessDate);

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Daily Flash</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

        <form className="no-print mb-3 flex items-end gap-3 rounded-md border border-gray-300 bg-white p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Business Date</span>
            <select name="date" defaultValue={businessDate ? toBusinessDateInputValue(businessDate) : ""} className="rounded border border-gray-400 px-2 py-1.5 text-sm">
              {history.map((h) => (
                <option key={h.id} value={toBusinessDateInputValue(h.businessDate)}>
                  {formatBusinessDate(h.businessDate)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            View
          </button>
        </form>

        {!report ? (
          <p className="rounded-md border border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            No closed business date yet — run Night Audit first.
          </p>
        ) : (
          <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
            <div className="flex items-start justify-between border-b border-gray-200 pb-4">
              <div>
                <h1 className="text-lg font-bold">{property.name}</h1>
                <p className="text-sm text-gray-500">Daily Flash — {formatBusinessDate(report.businessDate)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Stat label="Rooms Sold" value={String(report.roomsSold)} />
              <Stat label="Occupancy" value={`${report.occupancyPercent}%`} />
              <Stat label="Room Revenue" value={formatMoney(report.roomRevenue)} />
              <Stat label="Tax Collected" value={formatMoney(report.taxCollected)} />
              <Stat label="ADR" value={formatMoney(report.adr)} />
              <Stat label="RevPAR" value={formatMoney(report.revpar)} />
              <Stat label="Cash/Check/Other" value={formatMoney(report.paymentsCash)} />
              <Stat label="Card" value={formatMoney(report.paymentsCard)} />
            </div>
            <div className="no-print mt-5 border-t border-gray-200 pt-4">
              <PrintButton />
            </div>
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
