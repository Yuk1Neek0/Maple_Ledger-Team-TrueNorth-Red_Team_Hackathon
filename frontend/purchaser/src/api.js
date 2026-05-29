// Thin client for the verifier backend.
//
// In mock mode it resolves to a hardcoded VerificationResult after a short
// delay (to exercise the loading state). In live mode it calls
// GET {BACKEND_URL}/verify/{root_hash} and returns the parsed JSON unchanged —
// the response is already the contract shape the UI binds to.

import { USE_MOCK, verifyUrl } from "./config.js";
import { mockVerificationResult } from "./mockData.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a verification result for a scanned root hash.
 * @param {string} rootHash - the root attestation hash encoded in the QR code
 * @returns {Promise<object>} a VerificationResult (see mockData.js for shape)
 */
export async function fetchVerification(rootHash) {
  if (!rootHash || !rootHash.trim()) {
    throw new Error("No root hash provided.");
  }
  const hash = rootHash.trim();

  if (USE_MOCK) {
    await delay(400);
    // Echo nothing about the hash — the mock is fixed by design.
    return mockVerificationResult;
  }

  let res;
  try {
    res = await fetch(verifyUrl(hash), {
      headers: { Accept: "application/json" },
    });
  } catch (networkErr) {
    throw new Error(
      `Could not reach the verifier backend. Is it running? (${networkErr.message})`,
      { cause: networkErr }
    );
  }

  if (!res.ok) {
    throw new Error(
      `Verifier returned HTTP ${res.status} ${res.statusText}.`
    );
  }

  return res.json();
}
