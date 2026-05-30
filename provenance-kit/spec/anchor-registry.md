# Anchor Registry Specification

**Version:** 1.0
**Status:** Locked

The anchor registry is the challenge's "published ledger", the immutable record of genuine attestations. Because all supplier private keys ship in the starter kit, an attacker can sign any chain correctly; the registry is the source of truth they cannot forge. Teams check submitted attestations against it.

It is shipped as a static signed JSON file in the starter kit, alongside the supplier public-key registry.

---

## Format

```json
{
  "version": "1.0",
  "issued_at": "2026-05-20T00:00:00Z",
  "anchors": [
    {
      "attestation_id": "att-018f4d2e-7a3c-4b91-9d8e-1c2f5a6b7e8d",
      "content_hash": "9f2c1a...e7",
      "product_id": "prod-recovery-drone-v1"
    }
  ],
  "signature": {
    "algorithm": "ed25519",
    "value": "base64-..."
  }
}
```

| Field | Notes |
|---|---|
| `anchors[].attestation_id` | A genuine, issued attestation. |
| `anchors[].content_hash` | SHA-256 (lowercase hex) of that attestation's canonical serialization (excluding its `signature`). Same hash teams compute for `parents[].content_hash` verification. |
| `anchors[].product_id` | The single product whose chain this attestation belongs to. An attestation belongs to exactly one product instance. |
| `signature` | Ed25519 over the canonical serialization of the registry (excluding `signature`), signed by the event/registry authority key shipped in the starter kit. |

---

## How teams use it

For each submitted attestation whose `attestation_id` appears in the registry:

- **Content check:** recompute the attestation's content hash; if it differs from the anchored `content_hash` → the attestation was rewritten (`anchor_mismatch`).
- **Provenance check:** if the attestation appears in a submission for a different `product_id` than its anchored one → cross-product reuse (`replay_cross_chain`).

## Critical: the registry is NOT exhaustive

The test suite includes **new products** whose attestations are not in the registry (a real system can't have pre-anchored everything; new products get scanned and verified). Therefore:

- **Absence from the registry is NOT a violation.** A clean, unanchored chain must verify as valid.
- For unanchored chains the registry gives no help; detection falls back to signature, hash-link, mass-balance, structural, semantic, and statistical checks.

This is deliberate: it stops the registry from becoming a universal lookup oracle that reduces the whole challenge to "is this id anchored?" Some cases are anchored (registry is the discriminator); some are not (teams must reason without it).

---

## Note on the registry signature

The registry authority key is distinct from supplier keys; its private key does NOT ship. Teams only need to verify the registry signature, not issue anchors.
