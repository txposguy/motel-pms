"use client";

import { useActionState } from "react";
import { reprintAtTerminalAction, type ReprintActionState } from "./actions";

const initialState: ReprintActionState = {};

// KNOWN BROKEN — see the comment on ValorConnectTerminal.reprint(). A live
// test showed the terminal accepts the request and prints a real receipt,
// but with the wrong amount ($0) and wrong card details — it isn't finding
// the requested transaction. Left wired up (not removed) so the plumbing
// is ready once that's fixed, but the button and copy here must keep
// saying so plainly: a "success" from this action does not mean a correct
// receipt printed.
export function ReprintAtTerminalButton({ propertyId, paymentId }: { propertyId: string; paymentId: string }) {
  const [state, formAction, pending] = useActionState(reprintAtTerminalAction, initialState);

  return (
    <div className="no-print mt-3">
      <p className="mb-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
        <strong>Known broken.</strong> A live test showed the terminal prints a receipt with the wrong amount and
        wrong card details instead of the real ones — don&apos;t use this with a guest present.
      </p>
      <form action={formAction}>
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-red-400 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending to terminal…" : "Reprint at Terminal (broken — test only)"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-sm font-semibold text-red-600">{state.error}</p>}
      {state.success && (
        <p className="mt-2 text-sm font-semibold text-amber-700">
          The terminal accepted the request — but check the printout carefully, it&apos;s known to come out wrong.
        </p>
      )}
    </div>
  );
}
