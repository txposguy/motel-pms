"use client";

import { useActionState } from "react";
import { pullTerminalBatchAction, type ReconciliationActionState } from "./actions";
import { formatMoney } from "@/lib/checkin/rate";

const initialState: ReconciliationActionState = {};

export function PullBatchButton({ pmsCount, pmsTotalCents }: { pmsCount: number; pmsTotalCents: number }) {
  const [state, formAction, pending] = useActionState(async (): Promise<ReconciliationActionState> => pullTerminalBatchAction(), initialState);
  const batch = state.batch;
  const countMismatch = batch && batch.totalCount !== pmsCount;
  const amountMismatch = batch && batch.totalAmountCents !== pmsTotalCents;

  return (
    <div className="no-print mt-5 border-t border-gray-200 pt-4">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {pending ? "Pulling batch…" : "Pull Terminal Batch"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}

      {batch && (
        <div className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-3 text-sm">
          <div className="font-semibold text-gray-700">Terminal Batch {batch.batchId || "(no batch id returned)"}</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Terminal Count</div>
              <div className={countMismatch ? "font-bold text-red-600" : "font-bold"}>{batch.totalCount}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Terminal Amount</div>
              <div className={amountMismatch ? "font-bold text-red-600" : "font-bold"}>{formatMoney(batch.totalAmountCents / 100)}</div>
            </div>
          </div>
          {(countMismatch || amountMismatch) && (
            <p className="mt-2 font-semibold text-red-600">⚠ Mismatch against PMS records — see the table above.</p>
          )}
          {!countMismatch && !amountMismatch && <p className="mt-2 font-semibold text-green-700">✓ Matches PMS records.</p>}
        </div>
      )}
    </div>
  );
}
