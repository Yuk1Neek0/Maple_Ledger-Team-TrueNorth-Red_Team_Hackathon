# Frontend ↔ Backend API

API reference for the two demo UIs (`frontend/purchaser`, `frontend/supplier`)
talking to the verifier backend. Generated from the actual codebase
(`backend/app/main.py`, `frontend/purchaser/src/api.js`,
`frontend/supplier/src/lib/api.js`, the spec under `provenance-kit/spec/`).

The frontend uses **exactly two** backend routes:

| Route | Used by | Purpose |
|---|---|---|
| `POST /verify` | purchaser + supplier | Verify a whole chain, get the scored verdict |
| `POST /draft`  | supplier only | Advisory: LLM drafts an attestation from plain English |

Everything else the backend exposes (`/health`, `/registry`, `/log/*`,
`/attestations`, `GET /verify/{hash}`, `POST /ask`) is **not called by either UI**
and is omitted here. See `backend/app/main.py` if you need them.

---

## Configuration

Base URL comes from a Vite env var, defaulting to the local backend.

| App | Env var | Default | Source |
|---|---|---|---|
| purchaser | `VITE_BACKEND_URL` | `http://localhost:8000` | `src/config.js` |
| supplier  | `VITE_BACKEND_URL` | `http://localhost:8000` | `src/lib/api.js` |

- Purchaser strips any trailing slash and builds `${BACKEND_URL}/verify`
  via `verifyUrl()` (`config.js:14-20`).
- Set it in `.env.local` (purchaser) — see `frontend/purchaser/.env.example`.
- CORS is wide open on the backend (`allow_origins=["*"]`), so the browser
  calls succeed cross-origin (`main.py:49-54`).

---

## `POST /verify`

Verify a complete provenance chain in one stateless request. No prior ingest, no
server-side state — the whole chain is submitted every time.

**Backend handler:** `main.py:98` → `verify.verify_chain` →
`verify.to_verify_response` (`verify.py:250`, `:326`).

### Request

```
POST {BACKEND_URL}/verify
Content-Type: application/json
Accept: application/json
```

```jsonc
{
  "product_attestation_id": "att-anchor-0012",   // id of the leaf / finished product
  "attestations": [ /* the leaf attestation PLUS all ancestors */ ]
}
```

- `attestations` array order is **unspecified**; the backend builds the DAG from
  each attestation's `parents[].content_hash` regardless of order.
- Each attestation object follows the wire schema (see
  [Attestation object](#attestation-object) below).
- `product_attestation_id` must match the `attestation_id` of one attestation in
  the array (the finished product). If absent, the backend tolerates a raw
  content-hash being passed instead (`verify.py:271`).

**Client wrappers**

- Purchaser — `verifyChain(chain)` (`src/api.js:21`). Throws before sending if
  `chain` is missing `product_attestation_id` or `attestations` is not an array.
- Supplier — `submitAttestation(signedAttestation)` (`src/lib/api.js:21`). Wraps
  a single freshly-signed attestation as a one-node chain:
  ```js
  { product_attestation_id: signedAttestation.attestation_id,
    attestations: [signedAttestation] }
  ```
  (A `raw_material_supply` node has no parents, so it self-verifies.)

### Response — `200 OK`

```jsonc
{
  "product_attestation_id": "att-anchor-0012",   // echoes the request
  "canadian_content_percentage": 58.4,           // number, 0–100, 2 dp
  "designation": "made_in_canada",               // "product_of_canada" | "made_in_canada" | "none"
  "chain_valid": true,                            // boolean — true iff no scored anomalies
  "anomalies": [                                  // array; empty when clean
    {
      "type": "mass_balance_violation",          // free-form snake_case label
      "attestation_id": "att-anchor-0007",       // the offending attestation
      "details": "consumed 15.0 m2, available 10.0 m2"  // human-readable, not graded
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `product_attestation_id` | string | Echoes the submitted id. |
| `canadian_content_percentage` | number | 0–100, rounded to 2 dp (`verify.py:344`). |
| `designation` | string enum | `product_of_canada` \| `made_in_canada` \| `none` (lowercase). |
| `chain_valid` | boolean | `true` iff the `anomalies` array is empty. |
| `anomalies` | array | One entry per detected violation; `[]` when clean. |
| `anomalies[].type` | string | Free-form; see [Anomaly types](#anomaly-types). |
| `anomalies[].attestation_id` | string | The offending attestation. |
| `anomalies[].details` | string | Debug-only specifics; **not** graded/displayed verbatim. |

> **Two independent invariants** (assume nothing else):
> - `designation == "none"` does **not** imply `chain_valid == false`. A clean
>   chain can score `none` simply by failing the cost threshold.
> - A clean chain returns an **empty** `anomalies` array.

> **The response carries no graph and no cost breakdown.** The purchaser derives
> topology and cost-by-country **client-side** from the chain it already
> submitted (`src/chain.js`, `src/api.js:11-12`). Only
> designation / percentage / chain_valid / anomalies come from the backend.

### Errors

The backend returns FastAPI-style errors as `{ "detail": ... }`.

| Status | When | Client behaviour |
|---|---|---|
| `4xx`/`5xx` | Bad request / internal error | Both clients throw an `Error` including the HTTP status; they try to read `detail` from the JSON body and append it. (`api.js:45-54`, `lib/api.js:41-47`) |
| network failure | Backend unreachable | Purchaser throws `"Could not reach the verifier backend. Is it running?"` (`api.js:38-43`). |

Malformed input does not hang or crash the service, and one bad request never
poisons the next (the endpoint is stateless) — see the robustness scenarios in
`test_suite_2/features/verify_complete.feature` §L.

### Worked example

Request: the recovery-drone chain
(`provenance-kit/worked-example/recovery_drone_chain.json`, 12 attestations,
`product_attestation_id: "att-anchor-0012"`).

Response:

```json
{
  "product_attestation_id": "att-anchor-0012",
  "canadian_content_percentage": 58.4,
  "designation": "made_in_canada",
  "chain_valid": true,
  "anomalies": []
}
```

---

## `POST /draft` (supplier only, advisory)

An LLM drafts a single attestation from a plain-English description. **Advisory
only** — the model never signs and never decides a verdict; the supplier reviews
and edits every field before signing.

**Backend handler:** `main.py:150`. **Client:** `frontend/supplier/src/App.jsx:416-430`
(`draft()` → `fetch(`${BACKEND_URL}/draft`)` → `applyDraft(data.draft)`).

### Request

```
POST {BACKEND_URL}/draft
Content-Type: application/json
```

```json
{ "text": "We machined 1 parachute assembly in Quebec from 8 m2 of ripstop fabric, 6.5 labour hours, $520 labour." }
```

### Response — `200 OK`

```jsonc
{
  "draft": { /* attestation-shaped object: supplier_id, output, inputs,
                materials_cents, labour_cents, work_country,
                is_substantial_transformation, timestamp, ... */ },
  "valid": true,                       // did the draft pass schema validation
  "notes": "Schema-valid draft — review every field before signing."
}
```

The supplier maps `data.draft` onto the form (`applyDraft`, `App.jsx:280-300`):
it reads `draft.supplier_id`, `draft.action_type`, `draft.performed_in_country`,
`draft.output.{name,quantity_produced,unit}`,
`draft.costs.{material_cad,labour_hours,labour_cost_cad}`, `draft.timestamp`,
and `draft.parents[]`. Every value is editable before signing.

### Errors

| Status | Meaning |
|---|---|
| `503` | AI authoring unavailable — `ANTHROPIC_API_KEY` not set (`main.py:156`). |
| `400` | Missing `text`. |
| `502` | Upstream LLM draft failed. |

The supplier UI surfaces these as a draft error and falls back to manual entry —
the `/draft` route is optional; with no key the whole feature degrades gracefully
and nothing else is affected (`.env.example`).

---

## Attestation object

The wire format both apps send inside `attestations[]`. Canonical source:
`provenance-kit/spec/attestation-schema.md`; JSON Schema at
`frontend/supplier/src/schema/attestation.schema.json` and
`schema/attestation.schema.json`.

```jsonc
{
  "attestation_id": "att-anchor-0001",        // "att-" + UUID v4, globally unique
  "version": "1.0",                            // always "1.0"
  "supplier_id": "sup-porcher",                // selects the registry public key
  "timestamp": "2026-03-06T09:00:00Z",         // ISO-8601 UTC, "Z" suffix
  "action_type": "raw_material_supply",        // see enum below
  "performed_in_country": "FR",                // ISO 3166-1 alpha-2; drives CA attribution
  "parents": [                                 // consumed inputs; [] for raw_material_supply
    {
      "attestation_id": "att-anchor-0000",
      "content_hash": "9f2c1a…e7",             // sha256 (lowercase hex) of parent's canonical bytes
      "quantity_consumed": 8.0,                // drives mass-balance
      "unit": "m2"                             // must equal parent output.unit
    }
  ],
  "output": {
    "name": "PN9 Ripstop Fabric",             // display label
    "quantity_produced": 8.0,
    "unit": "m2"
  },
  "costs": {
    "material_cad": 360.0,                      // CAD
    "labour_hours": 0.0,                        // NOT a cost; ≥4 (at a transform step) ⇒ substantial transformation
    "labour_cost_cad": 0.0                      // CAD
  },
  "signature": {
    "algorithm": "ed25519",
    "value": "DdFl42bZO0Ux…Q=="               // base64 Ed25519 over canonical(attestation − signature)
  }
}
```

**`action_type` enum:** `raw_material_supply` (parents `[]`) ·
`component_manufacture` (1+ parents) · `subassembly` (2+) ·
`final_integration` (2+).

**Cost / designation rules** (computed by the backend, `provenance-kit/spec/computation.md`):
- Percentage = flat sum over **every** attestation:
  `Σ(CA-node material+labour cost) / Σ(all cost) × 100`. `labour_hours` is not a cost.
- Attribution is by `performed_in_country`, **not** the supplier's registered country.
- `designation`: needs `total > 0` **and** a substantial transformation
  (`action_type ∈ {component_manufacture, subassembly, final_integration}` and
  `labour_hours ≥ 4`) whose `performed_in_country == "CA"`; then `≥98 →
  product_of_canada`, `≥51 → made_in_canada`, else `none`.

### Client-side signing (supplier)

The supplier signs **in the browser** before POSTing (`src/lib/crypto.js`,
`src/lib/canonical.js`):
1. `canonicalize(attestation − signature)` — must be byte-identical to the Python
   reference lib (sorted keys recursively, compact, whole-numbers-as-ints, raw
   UTF-8, no NaN/Infinity).
2. `content_hash` = SHA-256 (lowercase hex) of those bytes — used as the
   `parents[].content_hash` link key.
3. Ed25519 sign with the supplier's private key → `signature.value` (base64).

A startup self-test (`src/lib/canonical.test.js`) asserts the JS canonicalizer
matches known Python output. The private key never leaves the browser; only the
signed attestation is sent.

---

## Anomaly types

`anomalies[].type` is **free-form** per the spec — the set is open, not a closed
enum. The purchaser humanizes known labels and title-cases the rest
(`src/labels.js`, `anomalyLabel()`):

| `type` (backend) | UI label |
|---|---|
| `signature_invalid` | Invalid signature |
| `signature_unknown_supplier` | Unknown supplier |
| `parent_hash_mismatch` | Parent hash mismatch |
| `mass_balance_violation` | Mass-balance violation |
| `circular_reference` | Circular provenance |
| `dangling_parent` | Broken provenance link |
| `timestamp_inversion` | Out-of-order timestamps |
| `unit_mismatch` | Unit mismatch |
| `transformation_implausible` | Implausible transformation |
| `cost_anomaly` | Cost anomaly |
| `insufficient_data` | Insufficient data |
| *(anything else)* | title-cased from the snake_case string |

The backend's internal `Reason` → `type` mapping lives in `verify.py:314`
(`REASON_TO_TYPE`); advisory/heuristic anomalies are dropped from the scored
`/verify` response and never reach the UI (`verify.py:329-341`).

---

## Quick reference

```js
// Purchaser — verify a whole chain
import { verifyChain } from "./api.js";
const result = await verifyChain({ product_attestation_id, attestations });
// result: { product_attestation_id, canadian_content_percentage,
//           designation, chain_valid, anomalies[] }

// Supplier — submit one signed attestation as a single-node chain
import { submitAttestation } from "./lib/api.js";
const result = await submitAttestation(signedAttestation);

// Supplier — advisory AI draft (optional; 503 without ANTHROPIC_API_KEY)
const res = await fetch(`${BACKEND_URL}/draft`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
});
const { draft, valid, notes } = await res.json();
```
