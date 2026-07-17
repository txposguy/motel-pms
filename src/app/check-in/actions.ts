"use server";

import { redirect } from "next/navigation";
import { checkInGuest, findGuestByIdNumber, type CheckInInput } from "@/lib/data/checkin";
import { takePayment } from "@/lib/data/payments";
import { prisma } from "@/lib/prisma";
import type { IdType } from "@/generated/prisma/enums";

export async function lookupGuestAction(propertyId: string, idNumber: string) {
  if (!idNumber || idNumber.trim().length < 3) return null;
  return findGuestByIdNumber(propertyId, idNumber);
}

export type CheckInActionState = { error?: string };

async function parseAndValidate(formData: FormData): Promise<{ input: CheckInInput } | { error: string }> {
  const additionalGuestsRaw = String(formData.get("additionalGuests") || "");
  const additionalGuests = additionalGuestsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const idNumber = String(formData.get("idNumber") || "").trim();
  const dnrOverride = formData.get("dnrOverride") === "on";

  if (idNumber) {
    const existing = await findGuestByIdNumber(String(formData.get("propertyId")), idNumber);
    if (existing?.dnrFlag && !dnrOverride) {
      return { error: `${existing.firstName} ${existing.lastName} is flagged Do Not Rent. Check-in blocked.` };
    }
  }

  const input: CheckInInput = {
    propertyId: String(formData.get("propertyId")),
    roomId: String(formData.get("roomId")),
    ratePlanId: String(formData.get("ratePlanId")),
    firstName: String(formData.get("firstName") || "").trim(),
    middleName: String(formData.get("middleName") || "").trim() || undefined,
    lastName: String(formData.get("lastName") || "").trim(),
    addressLine1: String(formData.get("addressLine1") || "").trim() || undefined,
    city: String(formData.get("city") || "").trim() || undefined,
    state: String(formData.get("state") || "").trim() || undefined,
    zip: String(formData.get("zip") || "").trim() || undefined,
    dob: String(formData.get("dob") || "").trim() || undefined,
    phone: String(formData.get("phone") || "").trim() || undefined,
    email: String(formData.get("email") || "").trim() || undefined,
    idType: (String(formData.get("idType") || "").trim() || undefined) as IdType | undefined,
    idNumber: idNumber || undefined,
    idState: String(formData.get("idState") || "").trim() || undefined,
    idExpiration: String(formData.get("idExpiration") || "").trim() || undefined,
    vehicleMake: String(formData.get("vehicleMake") || "").trim() || undefined,
    vehicleModel: String(formData.get("vehicleModel") || "").trim() || undefined,
    vehicleColor: String(formData.get("vehicleColor") || "").trim() || undefined,
    vehiclePlate: String(formData.get("vehiclePlate") || "").trim() || undefined,
    vehicleState: String(formData.get("vehicleState") || "").trim() || undefined,
    adults: Number(formData.get("adults") || 1),
    children: Number(formData.get("children") || 0),
    additionalGuests,
    rawAamvaPayload: String(formData.get("rawAamvaPayload") || "").trim() || undefined,
  };

  if (!input.firstName || !input.lastName) return { error: "First and last name are required." };
  if (!input.roomId) return { error: "Select a room." };
  if (!input.ratePlanId) return { error: "Select a rate plan." };

  return { input };
}

export async function checkInAction(
  _prevState: CheckInActionState,
  formData: FormData
): Promise<CheckInActionState> {
  const parsed = await parseAndValidate(formData);
  if ("error" in parsed) return parsed;

  try {
    await checkInGuest(parsed.input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Check-in failed." };
  }

  redirect("/");
}

export async function checkInAndPayAction(
  _prevState: CheckInActionState,
  formData: FormData
): Promise<CheckInActionState> {
  const parsed = await parseAndValidate(formData);
  if ("error" in parsed) return parsed;

  let stayId: string;
  try {
    const result = await checkInGuest(parsed.input);
    stayId = result.stay.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Check-in failed." };
  }

  // Check-in itself always succeeds once we've decided to rent the room —
  // a declined or timed-out payment doesn't un-rent it. The clerk resolves
  // payment from the folio screen we redirect to below either way.
  const folio = await prisma.folio.findFirstOrThrow({
    where: { stayId },
    include: { lines: true },
  });
  const totalDue = folio.lines.reduce((sum, line) => sum + Number(line.amount), 0);

  try {
    await takePayment({ propertyId: parsed.input.propertyId, folioId: folio.id, method: "card", amount: totalDue });
  } catch {
    // Fall through — the folio screen will show the failed/pending payment.
  }

  redirect(`/stays/${stayId}`);
}
