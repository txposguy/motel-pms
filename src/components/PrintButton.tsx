"use client";

export function PrintButton({ label = "PRINT REPORT" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
    >
      {label}
    </button>
  );
}
