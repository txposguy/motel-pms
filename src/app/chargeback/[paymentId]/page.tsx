import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getChargebackPacket } from "@/lib/data/chargebackPacket";
import { formatMoney } from "@/lib/checkin/rate";
import { PrintButton } from "@/components/PrintButton";

const TYPE_LABELS: Record<string, string> = {
  room_charge: "Room Charge",
  tax: "Tax",
  incidental: "Incidental",
  adjustment: "Adjustment",
  void: "Void",
};

export default async function ChargebackPacketPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const property = await getPrimaryProperty();
  if (!property) notFound();

  let packet;
  try {
    packet = await getChargebackPacket(property.id, paymentId);
  } catch (err) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center text-sm text-red-600">
        {err instanceof Error ? err.message : "Could not build a chargeback packet for this payment."}
      </main>
    );
  }
  if (!packet) notFound();

  const disputedAmount = packet.payment.amountSettled ?? packet.payment.amountRequested;

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-3xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Chargeback Evidence Packet</h1>
          <Link href={`/stays/${packet.stay.id}`} className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Folio
          </Link>
        </div>

        <p className="no-print mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Assembled from records already in LodgeDesk — contains an unmasked ID number, so this access has been
          written to the audit log. This does not submit anything to Valor automatically; print or save as PDF and
          upload it to Valor&apos;s dispute portal yourself.
        </p>

        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="border-b border-gray-200 pb-4">
            <h1 className="text-lg font-bold">{packet.property.name}</h1>
            <p className="text-sm text-gray-500">
              {packet.property.address}, {packet.property.city}, {packet.property.state} {packet.property.zip} · {packet.property.phone}
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-700">
              Chargeback Evidence Packet — prepared {packet.generatedAt.toLocaleString()}
            </p>
          </div>

          <Section title="Disputed Transaction">
            <Grid>
              <Field label="Date" value={packet.payment.createdAt.toLocaleString()} />
              <Field label="Status" value={packet.payment.status} />
              <Field label="Amount" value={formatMoney(disputedAmount)} />
              {packet.payment.cardBrand && packet.payment.maskedPan && (
                <Field label="Card" value={`${packet.payment.cardBrand} ${packet.payment.maskedPan}`} />
              )}
              {packet.payment.entryMode && <Field label="Entry Mode" value={packet.payment.entryMode} />}
              {packet.payment.authCode && <Field label="Auth Code" value={packet.payment.authCode} />}
              {packet.payment.providerRrn && <Field label="RRN" value={packet.payment.providerRrn} />}
              {packet.payment.providerTransactionId && <Field label="Terminal Ref" value={packet.payment.providerTransactionId} />}
              {packet.payment.isPreauth && (
                <Field label="Type" value={packet.payment.preauthCapturedAt ? "Pre-Authorization (Captured)" : "Pre-Authorization (Held)"} />
              )}
            </Grid>
          </Section>

          <Section title="Guest on File">
            <Grid>
              <Field label="Name" value={packet.guest.name} />
              {packet.guest.address && <Field label="Address" value={packet.guest.address} />}
              {packet.guest.phone && <Field label="Phone" value={packet.guest.phone} />}
              {packet.guest.email && <Field label="Email" value={packet.guest.email} />}
              {packet.guest.dob && <Field label="DOB" value={packet.guest.dob.toLocaleDateString()} />}
              {packet.guest.idNumber && (
                <Field label="ID" value={`${packet.guest.idType ?? ""} ${packet.guest.idNumber} (${packet.guest.idState ?? "—"})`} />
              )}
              {packet.guest.idExpiration && <Field label="ID Expires" value={packet.guest.idExpiration.toLocaleDateString()} />}
              {packet.guest.vehicle && <Field label="Vehicle" value={packet.guest.vehicle} />}
            </Grid>
          </Section>

          <Section title="Stay">
            <Grid>
              <Field label="Room" value={`${packet.stay.roomNumber} — ${packet.stay.roomTypeName}`} />
              <Field label="Rate Plan" value={packet.stay.ratePlanName} />
              <Field label="Check-In" value={packet.stay.checkedInAt.toLocaleString()} />
              <Field label="Expected Check-Out" value={packet.stay.expectedCheckOutAt.toLocaleString()} />
              <Field label="Actual Check-Out" value={packet.stay.checkedOutAt ? packet.stay.checkedOutAt.toLocaleString() : "Still in house"} />
              <Field label="Occupants" value={`${packet.stay.adults} adult${packet.stay.adults === 1 ? "" : "s"}${packet.stay.children > 0 ? `, ${packet.stay.children} child${packet.stay.children === 1 ? "" : "ren"}` : ""}`} />
            </Grid>
          </Section>

          <Section title={`Folio Charges (${packet.folioLines.length})`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5">Type</th>
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {packet.folioLines.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-500">{l.businessDate.toLocaleDateString()}</td>
                    <td className="py-1.5 text-gray-500">{TYPE_LABELS[l.type] ?? l.type}</td>
                    <td className="py-1.5">{l.description}</td>
                    <td className={`py-1.5 text-right ${l.amount < 0 ? "text-red-600" : ""}`}>{formatMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title={`Payment History (${packet.payments.length})`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5">Method</th>
                  <th className="py-1.5">Status</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {packet.payments.map((p) => (
                  <tr key={p.id} className={`border-b border-gray-100 ${p.isDisputed ? "bg-amber-50 font-semibold" : ""}`}>
                    <td className="py-1.5 text-gray-500">{p.createdAt.toLocaleString()}</td>
                    <td className="py-1.5 capitalize">
                      {p.method}
                      {p.isRefund && <span className="ml-1 text-xs text-red-600">(refund)</span>}
                      {p.isDisputed && <span className="ml-1 text-xs text-amber-700">← disputed</span>}
                    </td>
                    <td className="py-1.5 capitalize">{p.status}</td>
                    <td className="py-1.5 text-right">{formatMoney(p.amountSettled ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title={`Activity Timeline (${packet.timeline.length})`}>
            {packet.timeline.length === 0 ? (
              <p className="text-sm text-gray-400">No recorded activity.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {packet.timeline.map((t) => (
                  <li key={t.id} className="flex justify-between border-b border-gray-100 py-1">
                    <span>
                      {t.action.replace(/_/g, " ")} <span className="text-gray-400">by {t.userName}</span>
                    </span>
                    <span className="text-gray-500">{t.createdAt.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="no-print mt-5 border-t border-gray-200 pt-4">
            <PrintButton label="PRINT / SAVE AS PDF" />
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

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div>{value}</div>
    </div>
  );
}
