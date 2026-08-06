"use server";

import { revalidatePath } from "next/cache";
import { runNightAudit, type NightAuditReport } from "@/lib/data/nightAudit";

export type NightAuditActionState = { error?: string; report?: NightAuditReport };

export async function runNightAuditAction(
  _prevState: NightAuditActionState,
  formData: FormData
): Promise<NightAuditActionState> {
  const propertyId = String(formData.get("propertyId") || "");

  try {
    const report = await runNightAudit({ propertyId });
    revalidatePath("/night-audit");
    revalidatePath("/");
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not run night audit." };
  }
}
