import { getPrimaryProperty } from "@/lib/data/rooms";
import { getCheckInFormData } from "@/lib/data/checkin";
import { CheckInForm } from "./CheckInForm";

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room: roomId } = await searchParams;
  const property = await getPrimaryProperty();

  if (!property) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center text-gray-500">
        No property found. Run <code className="mx-1 rounded bg-gray-100 px-1">npx prisma db seed</code> first.
      </main>
    );
  }

  const { vacantRooms, ratePlans, taxRules, selectedRoom } = await getCheckInFormData(property.id, roomId);

  return (
    <CheckInForm
      property={{
        id: property.id,
        name: property.name,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        phone: property.phone,
        checkOutTime: property.checkOutTime,
        registrationCardFooterText: property.registrationCardFooterText,
      }}
      rooms={vacantRooms.map((r) => ({ id: r.id, roomNumber: r.roomNumber, roomTypeName: r.roomType.name }))}
      ratePlans={ratePlans.map((rp) => ({
        id: rp.id,
        name: rp.name,
        unit: rp.unit,
        durationUnits: rp.durationUnits,
        baseAmount: Number(rp.baseAmount),
      }))}
      taxRules={taxRules.map((tr) => ({
        id: tr.id,
        name: tr.name,
        ratePercent: Number(tr.ratePercent),
        appliesTo: tr.appliesTo,
      }))}
      preselectedRoomId={selectedRoom?.id}
    />
  );
}
