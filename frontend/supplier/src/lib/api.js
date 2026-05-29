// Submit a signed attestation to the Maple Ledger backend.
//
// The backend (task spec) exposes POST /attestations, schema-validates + stores
// the body, and returns { "hash": "<sha256 hex>" }. Signature verification
// happens later at /verify, so a generated key works for this submit flow.

// Overridable via Vite env (VITE_BACKEND_URL); defaults to the local backend.
export const BACKEND_URL =
  import.meta.env?.VITE_BACKEND_URL || "http://localhost:8000";

/**
 * POST a signed attestation (payload + signature) to /attestations.
 * @param {object} signedBody - the canonical payload plus a "signature" field
 * @returns {Promise<{ hash: string }>}
 */
export async function submitAttestation(signedBody) {
  const res = await fetch(`${BACKEND_URL}/attestations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signedBody),
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
