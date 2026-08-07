import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getPmsPaymentsForDate } from "@/lib/data/reports/paymentReconciliation";
import { parseDateParam, toDateInputValue } from "@/lib/reports/dateParams";
import { formatMoney } from "@/lib/checkin/rate";
import { PrintButton } from "@/components/PrintButton";
import { PullBatchButton } from "./PullBatchButton";

export default async function PaymentReconciliationPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const { date: dateParam } = await searchParams;
  const date = parseDateParam(dateParam, today);

  const pms = await getPmsPaymentsForDate(property.id, date);

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Payment Reconciliation</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

        <p className="no-print mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Pulling the terminal batch has not yet been live-tested against the real Valor terminal — every other
          terminal action in this app was verified live before being trusted, and this one hasn&apos;t been yet. The
          terminal always reports its <em>current open batch</em>, regardless of which date is selected below.
        </p>

        <form className="no-print mb-3 flex items-end gap-3 rounded-md border border-gray-300 bg-white p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Date</span>
            <input type="date" name="date" defaultValue={toDateInputValue(date)} className="rounded border border-gray-400 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            View
          </button>
        </form>

        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="border-b border-gray-200 pb-4">
            <h1 className="text-lg font-bold">{property.name}</h1>
            <p className="text-sm text-gray-500">Payment Reconciliation — {date.toLocaleDateString()} (PMS records)</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Card Transactions</div>
              <div className="text-base font-bold">{pms.count}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Card Total</div>
              <div className="text-base font-bold">{formatMoney(pms.totalAmountCents / 100)}</div>
            </div>
          </div>

          {pms.payments.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">No approved card payments recorded for this date.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">Time</th>
                  <th className="py-1.5">Auth Code</th>
                  <th className="py-1.5">Terminal Ref</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pms.payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-1.5">{p.createdAt.toLocaleTimeString()}</td>
                    <td className="py-1.5">{p.authCode ?? "—"}</td>
                    <td className="py-1.5">{p.providerTransactionId ?? "—"}</td>
                    <td className="py-1.5 text-right">{formatMoney(p.amountSettled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="no-print">
            <PullBatchButton pmsCount={pms.count} pmsTotalCents={pms.totalAmountCents} />
          </div>

          <div className="no-print mt-3 border-t border-gray-200 pt-4">
            <PrintButton />
          </div>
        </div>
      </div>
    </main>
  );
}
