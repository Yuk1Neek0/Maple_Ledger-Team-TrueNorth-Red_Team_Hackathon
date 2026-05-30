# Attestation Schema Specification

**Version:** 1.0
**Status:** Locked

This is the on-the-wire format teams consume and the scoring harness submits. It is produced by the generator from curation-layer product recipes.

---

## Attestation object

```json
{
  "attestation_id": "att-018f4d2e-7a3c-4b91-9d8e-1c2f5a6b7e8d",
  "version": "1.0",
  "supplier_id": "sup-avss-corp",
  "timestamp": "2026-04-15T14:30:00Z",
  "action_type": "component_manufacture",
  "performed_in_country": "CA",
  "parents": [
    {
      "attestation_id": "att-9c1a2b3d-...",
      "content_hash": "9f2c1a...e7",
      "quantity_consumed": 8.0,
      "unit": "m2"
    }
  ],
  "output": {
    "name": "Parachute Assembly",
    "quantity_produced": 1,
    "unit": "units"
  },
  "costs": {
    "material_cad": 0.0,
    "labour_hours": 6.5,
    "labour_cost_cad": 520.0
  },
  "signature": {
    "algorithm": "ed25519",
    "value": "base64-encoded-signature-bytes"
  }
}
```

## Field definitions

| Field | Type | Notes |
|---|---|---|
| `attestation_id` | string | `att-` + UUID v4. Globally unique across all products/chains. |
| `version` | string | Always `"1.0"` for this event. |
| `supplier_id` | string | References a supplier in the registry. Determines which public key verifies the signature. |
| `timestamp` | string | ISO 8601, UTC, `Z` suffix. Used for temporal anomaly detection. |
| `action_type` | enum | `raw_material_supply` \| `component_manufacture` \| `subassembly` \| `final_integration`. |
| `performed_in_country` | string | ISO 3166-1 alpha-2. Country where THIS step's work occurred. Drives Canadian-content attribution. Independent of the supplier's `registered_country`. |
| `parents` | array | References to consumed attestations. Empty array `[]` for `raw_material_supply`. |
| `parents[].attestation_id` | string | The consumed attestation. |
| `parents[].content_hash` | string | SHA-256 (lowercase hex) of the parent attestation's canonical serialization (excluding the parent's `signature`). Binds the child to the parent's content. Mismatch → `parent_hash_mismatch`. |
| `parents[].quantity_consumed` | number | Amount consumed. Drives mass-balance checking. |
| `parents[].unit` | string | Must equal the parent's `output.unit`. Mismatch → `unit_mismatch` anomaly. |
| `output.name` | string | Human-readable label (debug/UI). |
| `output.quantity_produced` | number | Total produced. Mass-balance: sum of children's `quantity_consumed` against this attestation must not exceed it. |
| `output.unit` | string | Unit of the output. Children consuming this must reference this unit. |
| `costs.material_cad` | number | Material expenditure at this node, CAD. |
| `costs.labour_hours` | number | Labour hours at this node. ≥4 (at a non-raw-material step) qualifies as substantial transformation. |
| `costs.labour_cost_cad` | number | Labour expenditure at this node, CAD. |
| `signature.algorithm` | string | Always `"ed25519"`. |
| `signature.value` | string | Base64 Ed25519 signature over the canonical serialization of all fields EXCEPT `signature`. |

## Per-action-type conventions

| action_type | parents | typical costs | substantial transformation eligible |
|---|---|---|---|
| `raw_material_supply` | `[]` (none) | `material_cad` > 0, labour ~0 | No |
| `component_manufacture` | 1+ | labour-heavy | Yes (if labour_hours ≥ 4) |
| `subassembly` | 2+ | labour-heavy | Yes (if labour_hours ≥ 4) |
| `final_integration` | 2+ | labour-heavy | Yes (if labour_hours ≥ 4) |

`raw_material_supply` represents a supplier providing an off-the-shelf component or raw material. Its cost lives in `material_cad`; this is the price paid for the material, attributed to the supplier's `performed_in_country` (= origin country).

## Canonical serialization (for signing/verifying)

1. JSON, keys sorted alphabetically at every nesting level.
2. No insignificant whitespace (compact separators).
3. UTF-8.
4. EXCLUDE the `signature` field when computing bytes-to-sign.
5. Whole numbers → integer form (`1`); non-whole → float, no trailing zeros (`520.5`).
6. No `NaN` / `Infinity`.

Implemented by the starter-kit reference library as `canonical_serialize()`. Documented here so any independent implementation matches byte-for-byte.

---

## Chain submission (harness → team backend)

```
POST /verify
Content-Type: application/json

{
  "product_attestation_id": "att-final-integration-xyz",
  "attestations": [
    { /* full attestation */ },
    { /* full attestation */ }
  ]
}
```

- `attestations` contains the leaf product attestation plus ALL ancestors.
- Array order is unspecified. Teams must build the DAG from `parents` references regardless of order.

## Verifier response (team backend → harness)

```json
{
  "product_attestation_id": "att-final-integration-xyz",
  "canadian_content_percentage": 56.3,
  "designation": "made_in_canada",
  "chain_valid": false,
  "anomalies": [
    {
      "type": "mass_balance_violation",
      "attestation_id": "att-9c1a2b3d-...",
      "details": "consumed 15.0 m2, available 10.0 m2"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `product_attestation_id` | string | Echoes the submitted product id. |
| `canadian_content_percentage` | number | 0–100. Graded within a tolerance (see scoring). |
| `designation` | enum | `product_of_canada` \| `made_in_canada` \| `none`. |
| `chain_valid` | boolean | True iff no integrity anomalies were detected. |
| `anomalies` | array | One entry per detected violation. Empty if clean. |
| `anomalies[].type` | string | **Free-form**, not a closed enum. Use a short snake_case label describing the violation. Examples below; this list is NOT exhaustive, and part of the challenge is identifying attack classes the examples don't name. |
| `anomalies[].attestation_id` | string | The offending attestation, where applicable. |
| `anomalies[].details` | string | Human-readable specifics (not graded, useful for debugging). |

## Anomaly types: examples, NOT a complete list

The grader rewards flagging the correct offending attestation; a matching `type` label earns an additional classification bonus. The set of attacks present in the test suite is broader than these examples. Detecting violations the spec does not name is where strong teams separate.

Example labels: `signature_invalid`, `signature_unknown_supplier`, `parent_hash_mismatch`, `mass_balance_violation`, `circular_reference`, `dangling_parent`, `timestamp_inversion`, `unit_mismatch`, `insufficient_data`.

## Anchor registry

Teams are shipped a public **anchor registry** mapping genuine `attestation_id` → `content_hash` → `product_id` (see `spec/anchor-registry.md`). It is the immutable reference an attacker cannot rewrite. Use it to detect rewritten content and attestations reused outside their registered product. Note: the registry is **not exhaustive**: new products appear in the test set whose attestations are not anchored, so absence from the registry is not itself a violation.
