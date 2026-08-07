"use client";

import { useActionState, useState } from "react";
import { pullTerminalBatchAction, type ReconciliationActionState } from "./actions";
import { formatMoney } from "@/lib/checkin/rate";

const initialState: ReconciliationActionState = {};

// Live-tested: settle() doesn't just READ the terminal's batch, it CLOSES
// it — every transaction sitting in the current open batch moves to
// settled, and anything charged afterward starts a new batch. Confirmed by
// accident: pulling the batch twice in a row showed a real transaction the
// first time and "no transaction to settle" the second, because the first
// call had already closed it. That's exactly the real end-of-day
// settlement action, not a harmless status check — a two-step confirm
// stops a clerk from closing the batch just to glance at a number.
export function PullBatchButton({ pmsCount, pmsTotalCents }: { pmsCount: number; pmsTotalCents: number }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(async (): Promise<ReconciliationActionState> => pullTerminalBatchAction(), initialState);
  const batch = state.batch;
  const countMismatch = batch && batch.totalCount !== pmsCount;
  const amountMismatch = batch && batch.totalAmountCents !== pmsTotalCents;

  return (
    <div className="no-print mt-5 border-t border-gray-200 pt-4">
      {!confirming && !batch && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Settle &amp; Pull Terminal Batch
        </button>
      )}

      {confirming && !batch && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-800">
            This closes the terminal&apos;s current batch — the real end-of-day settlement action, not just a status
            check. Anything charged after this starts a new batch. Only do this once, at the actual end of the day.
          </p>
          <div className="mt-2 flex gap-2">
            <form action={formAction}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {pending ? "Settling…" : "Yes, settle the batch"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-md border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}

      {batch && (
        <div className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-3 text-sm">
          <div className="font-semibold text-gray-700">Terminal Batch {batch.batchId || "(no batch id returned — nothing was open to settle)"}</div>
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
