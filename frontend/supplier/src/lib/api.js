// Submit a signed attestation to the Maple Ledger backend.
//
// The real backend is stateless and exposes a single endpoint: POST /verify,
// which takes a WHOLE chain ({ product_attestation_id, attestations }) and
// returns a verdict. There is no separate ingest/store endpoint.
//
// For the issuing console, we POST the freshly-signed attestation as a
// single-node chain so the supplier sees the backend accept it and compute a
// real designation. (A self-contained raw_material_supply attestation has no
// parents, so it verifies on its own.)

// Overridable via Vite env (VITE_BACKEND_URL); defaults to the local backend.
export const BACKEND_URL =
  import.meta.env?.VITE_BACKEND_URL || "http://localhost:8000";

/**
 * POST a signed attestation to /verify as a single-node chain.
 * @param {object} signedAttestation - full attestation incl. the signature field
 * @returns {Promise<object>} the /verify response
 */
export async function submitAttestation(signedAttestation) {
  const body = {
    product_attestation_id: signedAttestation.attestation_id,
    attestations: [signedAttestation],
  };

  const res = await fetch(`${BACKEND_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const detail =
      data && (data.detail || data.error || data.message)
        ? JSON.stringify(data.detail || data.error || data.message)
        : text || `HTTP ${res.status}`;
    throw new Error(`Backend rejected attestation (HTTP ${res.status}): ${detail}`);
  }

  return data;
}
