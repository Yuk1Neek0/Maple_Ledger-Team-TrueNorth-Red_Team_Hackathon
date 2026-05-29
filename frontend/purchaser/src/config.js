// Runtime configuration for the purchaser UI.
//
// During development the real verifier engine is not finished yet — its
// /verify endpoint returns a stubbed all-zero / NONE result. So we default to
// a hardcoded mock VerificationResult and only hit the live backend when
// explicitly told to.
//
// Toggle behaviour (highest priority first):
//   1. URL query param  ?mock=0  (use live backend)  /  ?mock=1 (force mock)
//   2. Vite env var      VITE_USE_MOCK = "false"      (use live backend)
//   3. default                                        (use mock)
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
    if (param === "0" || param === "false") return false;
    if (param === "1" || param === "true") return true;
  }
  // Env var: VITE_USE_MOCK="false" opts into the live backend.
  if (env.VITE_USE_MOCK === "false" || env.VITE_USE_MOCK === false) {
    return false;
  }
  return true; // default: mock
}

export const USE_MOCK = readMockToggle();

export function verifyUrl(rootHash) {
  return `${BACKEND_URL}/verify/${encodeURIComponent(rootHash)}`;
}
