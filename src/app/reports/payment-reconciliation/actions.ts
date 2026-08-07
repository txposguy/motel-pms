"use server";

import { pullTerminalBatch } from "@/lib/data/reports/paymentReconciliation";
import type { BatchResult } from "@/lib/payments/terminal";

export type ReconciliationActionState = { error?: string; batch?: BatchResult };

export async function pullTerminalBatchAction(): Promise<ReconciliationActionState> {
  try {
    const batch = await pullTerminalBatch();
    return { batch };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach the terminal." };
  }
}
