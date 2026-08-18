// Small helpers for pulling specific fields back out of a payment's stored
// rawResponse (Valor's response envelope, persisted verbatim minus the
// PCI-adjacent redactions — see valorConnectTerminal.ts's redact()). These
// fields aren't on TxnResult, so the caller reads them from raw when
// needed rather than the app carrying a dedicated column for every field
// Valor happens to return.

type JsonLike = unknown;

function getResponseField(rawResponse: JsonLike, field: string): string | undefined {
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) return undefined;
  const response = (rawResponse as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return undefined;
  const value = (response as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

// The original transaction's terminal-assigned reference — Valor Connect
// needs this to void/capture it (discovered live). Not needed for
// refund/reprint, discovered the same way.
export function extractProviderRef(rawResponse: JsonLike): string | undefined {
  return getResponseField(rawResponse, "TRAN_NO");
}

// Valor's own words about the authorization outcome — on a real production
// card this is where an AVS/CVV result would actually show up (e.g. "AVS
// MATCH"), though a demo/staging card may not have real AVS data to check
// against at all (seen live: "SERV UNAVAILABLE" against a UAT test card
// with AVS/ZIP enabled on the terminal — inconclusive on a sandbox card,
// worth re-confirming against a real guest card once in production).
export function extractAuthResponseText(rawResponse: JsonLike): string | undefined {
  const text = getResponseField(rawResponse, "AUTH_RSP_TEXT");
  return text?.trim() || undefined;
}
