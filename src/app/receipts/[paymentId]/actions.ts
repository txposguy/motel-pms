"use server";

import { reprintAtTerminal } from "@/lib/data/payments";

export type ReprintActionState = { error?: string; success?: boolean };

export async function reprintAtTerminalAction(
  _prevState: ReprintActionState,
  formData: FormData
): Promise<ReprintActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const paymentId = String(formData.get("paymentId") || "");

  try {
    await reprintAtTerminal({ propertyId, paymentId });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reprint at the terminal." };
  }

  return { success: true };
}
