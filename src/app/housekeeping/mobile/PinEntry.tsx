"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { pinLoginAction, type HousekeeperActionState } from "./actions";

const initialState: HousekeeperActionState = {};
const PIN_LENGTH = 4;

export function PinEntry({ propertyId }: { propertyId: string }) {
  const [pin, setPin] = useState("");
  const [state, formAction, pending] = useActionState(pinLoginAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Resets local input state after a server action result, not a sync
    // with an external system — clears the dots so they can retry.
    if (state.error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPin("");
    }
  }, [state.error]);

  function pressDigit(digit: string) {
    if (pending) return;
    // Functional updater, not the closed-over `pin` — fast taps can fire
    // multiple pressDigit calls before React re-renders between them, and
    // reading `pin` directly would silently drop keystrokes.
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + digit;
      if (next.length === PIN_LENGTH) {
        setTimeout(() => formRef.current?.requestSubmit(), 150);
      }
      return next;
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-6 text-white">
      <h1 className="mb-2 text-2xl font-bold">Enter Your PIN</h1>
      <div className="mb-8 flex gap-3">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-gray-500 ${i < pin.length ? "bg-white" : "bg-transparent"}`}
          />
        ))}
      </div>

      {state.error && <p className="mb-4 text-sm font-semibold text-red-400">{state.error}</p>}
      {pending && <p className="mb-4 text-sm text-gray-400">Checking…</p>}

      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => pressDigit(d)}
            className="h-20 w-20 rounded-full bg-gray-800 text-3xl font-bold active:bg-gray-700"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPin("")}
          className="h-20 w-20 rounded-full bg-gray-800 text-sm font-bold active:bg-gray-700"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => pressDigit("0")}
          className="h-20 w-20 rounded-full bg-gray-800 text-3xl font-bold active:bg-gray-700"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="h-20 w-20 rounded-full bg-gray-800 text-2xl font-bold active:bg-gray-700"
        >
          ⌫
        </button>
      </div>

      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="pin" value={pin} />
      </form>
    </main>
  );
}
