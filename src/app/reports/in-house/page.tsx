import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getInHouseReport } from "@/lib/data/reports/inHouse";
import { formatMoney } from "@/lib/checkin/rate";
import { PrintButton } from "@/components/PrintButton";

export default async function InHousePage() {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const stays = await getInHouseReport(property.id);
  const totalBalance = Math.round(stays.reduce((sum, s) => sum + s.balance, 0) * 100) / 100;

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">In-House</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="flex items-start justify-between border-b border-gray-200 pb-4">
            <div>
              <h1 className="text-lg font-bold">{property.name}</h1>
              <p className="text-sm text-gray-500">In-House — {new Date().toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Rooms Occupied</div>
              <div className="text-lg font-bold">{stays.length}</div>
            </div>
          </div>

          {stays.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">No occupied rooms.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">Room</th>
                  <th className="py-1.5">Guest</th>
                  <th className="py-1.5">Rate Plan</th>
                  <th className="py-1.5">Departure</th>
                  <th className="py-1.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {stays.map((s) => (
                  <tr key={s.stayId} className="border-b border-gray-100">
                    <td className="py-1.5">{s.roomNumber}</td>
                    <td className="py-1.5">
                      {s.guestName}
                      {s.taxExempt && (
                        <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-700">
                          Tax Exempt
                        </span>
                      )}
                    </td>
                    <td className="py-1.5">{s.ratePlanName}</td>
                    <td className="py-1.5">{s.expectedCheckOutAt.toLocaleString()}</td>
                    <td className={`py-1.5 text-right ${s.balance > 0 ? "font-semibold text-amber-700" : ""}`}>{formatMoney(s.balance)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="py-1.5 text-right font-semibold text-gray-600">Total Balance Due</td>
                  <td className="py-1.5 text-right font-bold">{formatMoney(totalBalance)}</td>
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
