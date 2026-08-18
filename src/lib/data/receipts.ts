import { prisma } from "@/lib/prisma";
import { extractAuthResponseText } from "@/lib/payments/rawResponse";

// A per-transaction receipt, built entirely from what LodgeDesk already
// stores for a payment (amount, masked card, auth code, RRN...) — no
// terminal call, no card data beyond what §5.1 already allows persisting.
// Works for every payment method, unlike a terminal reprint (card only).
export async function getPaymentReceipt(propertyId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, folio: { stay: { propertyId } } },
    include: {
      folio: {
        include: {
          stay: {
            include: { guest: true, room: true, property: true },
          },
        },
      },
      refundsPayment: true,
    },
  });
  if (!payment) return null;

  const { stay } = payment.folio;

  return {
    id: payment.id,
    createdAt: payment.createdAt,
    method: payment.method,
    status: payment.status,
    amountRequested: Number(payment.amountRequested),
    amountSettled: payment.amountSettled === null ? null : Number(payment.amountSettled),
    isPreauth: payment.isPreauth,
    preauthCapturedAt: payment.preauthCapturedAt,
    isRefund: payment.refundsPaymentId !== null,
    refundsPaymentId: payment.refundsPaymentId,
    authCode: payment.authCode,
    providerRrn: payment.providerRrn,
    providerTransactionId: payment.providerTransactionId,
    maskedPan: payment.maskedPan,
    cardBrand: payment.cardBrand,
    entryMode: payment.entryMode,
    // Valor's own words about the authorization — on a real card this is
    // where an AVS/CVV result would show up (e.g. "AVS MATCH"). See
    // rawResponse.ts.
    authResponseText: extractAuthResponseText(payment.rawResponse),
    property: {
      name: stay.property.name,
      address: stay.property.address,
      city: stay.property.city,
      state: stay.property.state,
      zip: stay.property.zip,
      phone: stay.property.phone,
    },
    guestName: `${stay.guest.firstName} ${stay.guest.lastName}`,
    roomNumber: stay.room.roomNumber,
    stayId: stay.id,
  };
}

export type PaymentReceipt = NonNullable<Awaited<ReturnType<typeof getPaymentReceipt>>>;
