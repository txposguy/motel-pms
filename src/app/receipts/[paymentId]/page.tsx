import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrimaryProperty } from "@/lib/data/rooms";
import { getPaymentReceipt } from "@/lib/data/receipts";
import { formatMoney } from "@/lib/checkin/rate";
import { PrintButton } from "@/components/PrintButton";
import { ReprintAtTerminalButton } from "./ReprintAtTerminalButton";

const METHOD_LABELS: Record<string, string> = { cash: "Cash", card: "Card", check: "Check", other: "Other" };
const STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  declined: "bg-red-100 text-red-800",
  voided: "bg-gray-100 text-gray-600",
  refunded: "bg-gray-100 text-gray-600",
};

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const property = await getPrimaryProperty();
  if (!property) notFound();

  const receipt = await getPaymentReceipt(property.id, paymentId);
  if (!receipt) notFound();

  const displayAmount = receipt.amountSettled ?? receipt.amountRequested;

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <div className="w-full max-w-md">
        <div className="no-print mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Receipt</h1>
          <Link href={`/stays/${receipt.stayId}`} className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            Back to Folio
          </Link>
        </div>

        <div className="printable-card rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-sm">
          <div className="border-b border-gray-200 pb-4 text-center">
            <h1 className="text-lg font-bold">{receipt.property.name}</h1>
            <p className="text-sm text-gray-500">
              {receipt.property.address}, {receipt.property.city}, {receipt.property.state} {receipt.property.zip}
            </p>
            <p className="text-sm text-gray-500">{receipt.property.phone}</p>
          </div>

          <div className="mt-4 text-center">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[receipt.status] ?? ""}`}>
              {receipt.isRefund ? "Refund" : "Payment"} — {receipt.status}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <Row label="Date" value={receipt.createdAt.toLocaleString()} />
            <Row label="Guest" value={receipt.guestName} />
            <Row label="Room" value={receipt.roomNumber} />
            <Row label="Method" value={METHOD_LABELS[receipt.method] ?? receipt.method} />
            {receipt.isPreauth && <Row label="Type" value={receipt.preauthCapturedAt ? "Pre-Authorization (Captured)" : "Pre-Authorization (Held)"} />}
            {receipt.cardBrand && receipt.maskedPan && <Row label="Card" value={`${receipt.cardBrand} ${receipt.maskedPan}`} />}
            {receipt.entryMode && <Row label="Entry Mode" value={receipt.entryMode} />}
            {receipt.authCode && <Row label="Auth Code" value={receipt.authCode} />}
            {receipt.providerRrn && <Row label="RRN" value={receipt.providerRrn} />}
            {receipt.providerTransactionId && <Row label="Terminal Ref" value={receipt.providerTransactionId} />}
            {receipt.authResponseText && <Row label="Auth Response" value={receipt.authResponseText} />}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-semibold text-gray-600">{receipt.isRefund ? "Amount Refunded" : "Amount"}</span>
            <span className={`text-xl font-bold ${displayAmount < 0 ? "text-red-600" : ""}`}>{formatMoney(displayAmount)}</span>
          </div>

          <p className="mt-4 text-center text-[11px] text-gray-400">Reprinted {new Date().toLocaleString()}</p>

          <div className="no-print mt-5 border-t border-gray-200 pt-4 text-center">
            <PrintButton label="PRINT RECEIPT" />
          </div>

          {receipt.method === "card" && receipt.providerTransactionId && (
            <ReprintAtTerminalButton propertyId={property.id} paymentId={receipt.id} />
          )}
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
