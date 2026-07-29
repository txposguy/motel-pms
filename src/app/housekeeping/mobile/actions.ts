"use server";

import { revalidatePath } from "next/cache";
import { findHousekeeperByPin, startTask, completeTask, reportProblem } from "@/lib/data/housekeeping";
import { setHousekeeperSession, clearHousekeeperSession, getHousekeeperSession } from "@/lib/housekeeping/session";

export type HousekeeperActionState = { error?: string };

export async function pinLoginAction(
  _prevState: HousekeeperActionState,
  formData: FormData
): Promise<HousekeeperActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const pin = String(formData.get("pin") || "");

  const housekeeper = await findHousekeeperByPin(propertyId, pin);
  if (!housekeeper) return { error: "Incorrect PIN. Try again." };

  await setHousekeeperSession(housekeeper.id);
  revalidatePath("/housekeeping/mobile");
  return {};
}

export async function logoutAction() {
  await clearHousekeeperSession();
  revalidatePath("/housekeeping/mobile");
}

export async function startTaskAction(
  _prevState: HousekeeperActionState,
  formData: FormData
): Promise<HousekeeperActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const taskId = String(formData.get("taskId") || "");

  const housekeeper = await getHousekeeperSession(propertyId);
  if (!housekeeper) return { error: "Session expired. Enter your PIN again." };

  try {
    await startTask({ propertyId, taskId, userId: housekeeper.id });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start." };
  }

  revalidatePath("/housekeeping/mobile");
  return {};
}

export async function completeTaskAction(
  _prevState: HousekeeperActionState,
  formData: FormData
): Promise<HousekeeperActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const taskId = String(formData.get("taskId") || "");

  const housekeeper = await getHousekeeperSession(propertyId);
  if (!housekeeper) return { error: "Session expired. Enter your PIN again." };

  try {
    await completeTask({ propertyId, taskId, userId: housekeeper.id });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not finish." };
  }

  revalidatePath("/housekeeping/mobile");
  return {};
}

export async function reportProblemAction(
  _prevState: HousekeeperActionState,
  formData: FormData
): Promise<HousekeeperActionState> {
  const propertyId = String(formData.get("propertyId") || "");
  const taskId = String(formData.get("taskId") || "");
  const note = String(formData.get("note") || "").trim();

  if (!note) return { error: "Enter what's wrong." };

  const housekeeper = await getHousekeeperSession(propertyId);
  if (!housekeeper) return { error: "Session expired. Enter your PIN again." };

  try {
    await reportProblem({ propertyId, taskId, userId: housekeeper.id, note });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not report problem." };
  }

  revalidatePath("/housekeeping/mobile");
  return {};
}
