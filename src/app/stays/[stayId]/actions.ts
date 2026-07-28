"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addIncidentalCharge, extendStay } from "@/lib/data/folio";
import { capturePreAuth, reconcilePayment, takePayment, takePreAuth, voidPreAuth } from "@/lib/data/payments";
import { checkOutStay } from "@/lib/data/checkout";

export type FolioActionState = { error?: string };

export async function addChargeAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const description = String(formData.get("description") || "").trim();
  const amount = Number(formData.get("amount"));

  if (!description) return { error: "Enter a description for the charge." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };

  try {
    await addIncidentalCharge({ propertyId, stayId, description, amount });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add charge." };
  }

  revalidatePath(`/stays/${stayId}`);
  return {};
}

export async function takePaymentAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const folioId = String(formData.get("folioId") || "");
  const method = String(formData.get("method") || "") as "cash" | "card" | "check" | "other";
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };

  try {
    await takePayment({ propertyId, folioId, method, amount });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not take payment." };
  }

  revalidatePath(`/stays/${stayId}`);
  return {};
}

export async function reconcilePaymentAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const paymentId = String(formData.get("paymentId") || "");

  try {
    await reconcilePayment({ propertyId, paymentId });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reconcile payment." };
  }

  revalidatePath(`/stays/${stayId}`);
  return {};
}

export async function takePreAuthAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const folioId = String(formData.get("folioId") || "");
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };

  try {
    await takePreAuth({ propertyId, folioId, amount });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not authorize card." };
  }

  revalidatePath(`/stays/${stayId}`);
  return {};
}

export async function capturePreAuthAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const paymentId = String(formData.get("paymentId") || "");

  try {
    await capturePreAuth({ propertyId, paymentId });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not capture pre-authorization." };
  }

  revalidatePath(`/stays/${stayId}`);
  return {};
}

export async function voidPreAuthAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const paymentId = String(formData.get("paymentId") || "");

  try {
    await voidPreAuth({ propertyId, paymentId });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not void pre-authorization." };
  }

  revalidatePath(`/stays/${stayId}`);
  return {};
}

export async function checkOutAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const override = formData.get("override") === "on";
  const overrideReason = String(formData.get("overrideReason") || "").trim() || undefined;

  try {
    await checkOutStay({ propertyId, stayId, override, overrideReason });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check out." };
  }

  redirect("/");
}

export async function extendStayAction(
  _prevState: FolioActionState,
  formData: FormData
): Promise<FolioActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const stayId = String(formData.get("stayId") || "");
  const quantity = Number(formData.get("quantity") || 1);

  if (!Number.isFinite(quantity) || quantity < 1) return { error: "Enter a valid quantity." };

  try {
    await extendStay({ propertyId, stayId, quantity });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not extend stay." };
  }

  revalidatePath(`/stays/${stayId}`);
  return {};
}
