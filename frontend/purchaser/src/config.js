// Runtime configuration for the purchaser UI.
//
// The real backend serves a single stateless endpoint:
//   POST {BACKEND_URL}/verify
//   body { product_attestation_id, attestations: [ {full attestation}, ... ] }
//
// The purchaser loads a CHAIN (worked example or pasted JSON) and POSTs the
// whole thing in one request. There is no GET-by-hash / mock-feed flow anymore.
//
// Backend base URL comes from VITE_BACKEND_URL, defaulting to localhost:8000.

const env = import.meta.env ?? {};

export const BACKEND_URL = (
  env.VITE_BACKEND_URL || "http://localhost:8000"
).replace(/\/+$/, "");

export function verifyUrl() {
  return `${BACKEND_URL}/verify`;
}
