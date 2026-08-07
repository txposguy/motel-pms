import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getArrivalsDepartures } from "@/lib/data/reports/arrivalsDepartures";
import { parseDateParam, toDateInputValue } from "@/lib/reports/dateParams";
import { PrintButton } from "@/components/PrintButton";

export default async function ArrivalsDeparturesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const { date: dateParam } = await searchParams;
  const date = parseDateParam(dateParam, new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  const report = await getArrivalsDepartures(property.id, date);

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Arrivals / Departures</h1>
          <Link href="/reports" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Reports
          </Link>
        </div>

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
            <p className="text-sm text-gray-500">Arrivals / Departures — {date.toLocaleDateString()}</p>
          </div>

          <Section title={`Arrivals (${report.arrivals.length})`}>
            <StayTable rows={report.arrivals.map((s) => ({ ...s, time: s.checkedInAt.toLocaleTimeString() }))} empty="No arrivals." />
          </Section>
          <Section title={`Expected Departures (${report.expectedDepartures.length})`}>
            <StayTable rows={report.expectedDepartures.map((s) => ({ ...s, time: s.expectedCheckOutAt.toLocaleTimeString() }))} empty="No departures expected." />
          </Section>
          <Section title={`Actual Departures (${report.actualDepartures.length})`}>
            <StayTable
              rows={report.actualDepartures.map((s) => ({ ...s, time: s.checkedOutAt ? s.checkedOutAt.toLocaleTimeString() : "—" }))}
              empty="No one has checked out yet."
            />
          </Section>

          <div className="no-print mt-5 border-t border-gray-200 pt-4">
            <PrintButton />
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-gray-200 pt-3">
      <div className="text-sm font-semibold text-gray-600">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function StayTable({
  rows,
  empty,
}: {
  rows: Array<{ stayId: string; guestName: string; roomNumber: string; ratePlanName: string; time: string }>;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          <th className="py-1.5">Room</th>
          <th className="py-1.5">Guest</th>
          <th className="py-1.5">Rate Plan</th>
          <th className="py-1.5 text-right">Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.stayId} className="border-b border-gray-100">
            <td className="py-1.5">{r.roomNumber}</td>
            <td className="py-1.5">{r.guestName}</td>
            <td className="py-1.5">{r.ratePlanName}</td>
            <td className="py-1.5 text-right">{r.time}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
