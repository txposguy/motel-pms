import { notFound } from "next/navigation";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getStayDetail } from "@/lib/data/folio";
import { FolioView } from "./FolioView";

export default async function StayPage({ params }: { params: Promise<{ stayId: string }> }) {
  const { stayId } = await params;
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const stay = await getStayDetail(stayId, property.id);
  if (!stay || !stay.folio) notFound();

  return (
    <FolioView
      propertyId={property.id}
      property={{ name: property.name, address: property.address, city: property.city, state: property.state, zip: property.zip, phone: property.phone }}
      stay={{
        id: stay.id,
        status: stay.status,
        checkedInAt: stay.checkedInAt,
        expectedCheckOutAt: stay.expectedCheckOutAt,
        adults: stay.adults,
        children: stay.children,
        guestName: [stay.guest.firstName, stay.guest.lastName].join(" "),
        roomNumber: stay.room.roomNumber,
        roomTypeName: stay.room.roomType.name,
        ratePlanName: stay.ratePlan.name,
        ratePlanUnit: stay.ratePlan.unit,
        checkedInByName: stay.checkedInByUser.name,
      }}
      folio={{
        id: stay.folio.id,
        status: stay.folio.status,
        lines: stay.folio.lines.map((line) => ({
          id: line.id,
          createdAt: line.createdAt,
          type: line.type,
          description: line.description,
          amount: Number(line.amount),
        })),
      }}
    />
  );
}
