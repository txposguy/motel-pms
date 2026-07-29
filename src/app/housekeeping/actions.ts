"use server";

import { revalidatePath } from "next/cache";
import { assignTask, markInspected } from "@/lib/data/housekeeping";

export type HousekeepingActionState = { error?: string };

export async function assignTaskAction(
  _prevState: HousekeepingActionState,
  formData: FormData
): Promise<HousekeepingActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const taskId = String(formData.get("taskId") || "");
  const assignedToUserId = String(formData.get("assignedToUserId") || "") || null;

  try {
    await assignTask({ propertyId, taskId, assignedToUserId });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not assign task." };
  }

  revalidatePath("/housekeeping");
  return {};
}

export async function markInspectedAction(
  _prevState: HousekeepingActionState,
  formData: FormData
): Promise<HousekeepingActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const taskId = String(formData.get("taskId") || "");

  try {
    await markInspected({ propertyId, taskId });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not mark inspected." };
  }

  revalidatePath("/housekeeping");
  return {};
}
