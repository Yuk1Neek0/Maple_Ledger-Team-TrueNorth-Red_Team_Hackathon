// Runtime configuration for the purchaser UI.
//
// LIVE BACKEND IS THE DEFAULT (P3.2 — was previously mock-by-default, which
// caused demo confusion: the page would silently return the same canned result
// for any hash). Mock mode is still available via ?mock=1 or VITE_USE_MOCK=true
// for offline UI work.
//
// Toggle behaviour (highest priority first):
//   1. URL query param  ?mock=1  (force mock)  /  ?mock=0 (force live)
//   2. Vite env var      VITE_USE_MOCK = "true"      (use mock)
//   3. default                                        (use LIVE backend)
//
// Backend base URL comes from VITE_BACKEND_URL, defaulting to localhost:8000.

const env = import.meta.env ?? {};

export const BACKEND_URL = (
  env.VITE_BACKEND_URL || "http://localhost:8000"
).replace(/\/+$/, "");

function readMockToggle() {
  // URL param wins so the demo can flip modes without a rebuild.
  if (typeof window !== "undefined") {
    const param = new URLSearchParams(window.location.search).get("mock");
    if (param === "1" || param === "true") return true;
    if (param === "0" || param === "false") return false;
  }
  // Env var: VITE_USE_MOCK="true" opts back into the canned mock.
  if (env.VITE_USE_MOCK === "true" || env.VITE_USE_MOCK === true) {
    return true;
  }
  return false; // default: LIVE backend
}

export const USE_MOCK = readMockToggle();

export function verifyUrl(rootHash) {
  return `${BACKEND_URL}/verify/${encodeURIComponent(rootHash)}`;
}
