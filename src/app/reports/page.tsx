import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";

const REPORTS = [
  { href: "/reports/daily-flash", name: "Daily Flash", description: "Rooms sold, occupancy, ADR, RevPAR, tax collected, cash vs. card." },
  { href: "/reports/arrivals-departures", name: "Arrivals / Departures", description: "Who checked in, who's expected out, who actually left, for a day." },
  { href: "/reports/in-house", name: "In-House", description: "Every occupied room right now — guest, rate, balance, departure." },
  { href: "/reports/tax", name: "Tax Report", description: "Taxable vs. exempt revenue, tax collected by rule, exemptions granted — for a date range." },
  { href: "/reports/guest-registry", name: "Guest Registry Export", description: "Guest, ID, vehicle, room, and dates for a date range. Access is logged." },
  { href: "/reports/housekeeping", name: "Housekeeping", description: "Rooms cleaned per housekeeper and average time, for a date range." },
  { href: "/reports/shift", name: "Shift Report", description: "Cash and card totals, transaction count, per user, for a date range." },
  { href: "/reports/payment-reconciliation", name: "Payment Reconciliation", description: "PMS payment records vs. the terminal's batch — flags mismatches." },
];

export default async function ReportsIndexPage() {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Reports</h1>
          <Link href="/" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Room Rack
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORTS.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-lg border border-gray-300 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-50">{r.name}</div>
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
