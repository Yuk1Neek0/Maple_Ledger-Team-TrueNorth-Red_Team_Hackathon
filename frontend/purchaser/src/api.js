// Thin client for the real verifier backend.
//
// The contract is a single stateless POST:
//   POST {BACKEND_URL}/verify
//   body  { product_attestation_id, attestations: [ {full attestation}, ... ] }
//   200   { product_attestation_id, canadian_content_percentage (0-100),
//           designation ("product_of_canada"|"made_in_canada"|"none"),
//           chain_valid (bool),
//           anomalies: [ { type, attestation_id, details } ] }
//
// The response carries NO graph; the client already holds the submitted chain
// and builds the topology from each attestation's `parents`.

import { verifyUrl } from "./config.js";

/**
 * Verify a whole provenance chain.
 * @param {{ product_attestation_id: string, attestations: object[] }} chain
 * @returns {Promise<object>} the real /verify response shape
 */
export async function verifyChain(chain) {
  if (!chain || !chain.product_attestation_id || !Array.isArray(chain.attestations)) {
    throw new Error(
      "Chain must be { product_attestation_id, attestations: [...] }."
    );
  }

  let res;
  try {
    res = await fetch(verifyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(chain),
    });
  } catch (networkErr) {
    throw new Error(
      `Could not reach the verifier backend. Is it running? (${networkErr.message})`,
      { cause: networkErr }
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? ` — ${JSON.stringify(data.detail)}` : "";
    } catch {
      /* non-JSON body */
    }
    throw new Error(`Verifier returned HTTP ${res.status} ${res.statusText}.${detail}`);
  }

  return res.json();
}
