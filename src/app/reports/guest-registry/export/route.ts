import { getPrimaryProperty } from "@/lib/data/rooms";
import { getGuestRegistryExport } from "@/lib/data/reports/guestRegistry";
import { parseDateParam } from "@/lib/reports/dateParams";

function csvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  // Quote whenever the field contains a comma, quote, or newline — and
  // double up any embedded quotes, per RFC 4180.
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsvRow(fields: Array<string | number | null | undefined>): string {
  return fields.map(csvField).join(",") + "\r\n";
}

export async function GET(request: Request) {
  const property = await getPrimaryProperty();
  if (!property) return new Response("No property found.", { status: 404 });

  const url = new URL(request.url);
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const from = parseDateParam(url.searchParams.get("from") ?? undefined, defaultFrom);
  const to = parseDateParam(url.searchParams.get("to") ?? undefined, today);

  const rows = await getGuestRegistryExport(property.id, from, to);

  const header = toCsvRow(["Guest", "Address", "ID Type", "ID Number", "ID State", "Vehicle Plate", "Vehicle State", "Vehicle", "Room", "Check-In", "Check-Out"]);
  const body = rows
    .map((r) =>
      toCsvRow([
        r.guestName,
        r.address,
        r.idType,
        r.idNumber,
        r.idState,
        r.vehiclePlate,
        r.vehicleState,
        r.vehicleMakeModel,
        r.roomNumber,
        r.checkedInAt.toISOString(),
        r.checkedOutAt ? r.checkedOutAt.toISOString() : "",
      ])
    )
    .join("");

  const filename = `guest-registry_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;

  return new Response(header + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
