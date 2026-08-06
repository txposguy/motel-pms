import { notFound } from "next/navigation";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getBusinessDateHistory } from "@/lib/data/nightAudit";
import { NightAuditView } from "./NightAuditView";

export default async function NightAuditPage() {
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const history = await getBusinessDateHistory(property.id);

  return (
    <NightAuditView
      propertyId={property.id}
      propertyName={property.name}
      history={history.map((h) => ({
        id: h.id,
        businessDate: h.businessDate,
        status: h.status,
        roomsSold: h.roomsSold,
        roomRevenue: Number(h.roomRevenue),
        taxCollected: Number(h.taxCollected),
        occupancyPercent: Number(h.occupancyPercent),
        adr: Number(h.adr),
        revpar: Number(h.revpar),
      }))}
    />
  );
}
