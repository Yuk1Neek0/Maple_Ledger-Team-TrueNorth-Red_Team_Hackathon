# Maple Ledger — Mock vs Real Data: Field-by-Field Gap & Adapter Swap Map

> **As of 2026-05-30.** The real spec drop is now vendored at `provenance-kit/`
> (cloned from `Yuk1Neek0/provenance-hackathon`). This doc executes the plan in
> `01-implementation-record.md` §2 and `02-event-day-swap-guide.md` §3: for every
> adapter seam and field, it states **mock shape → real shape → the swap action**.
>
> Verdict up front: the data-format delta is **exactly the adapter swap we staged**.
> Most of it is field remapping behind `attestation_from_dict` + `payload_dict`,
> three `spec.py` knob-flips, and a registry-shape branch. A short list of items
> genuinely goes beyond the staged plan (§9, §10, §13, §14) — flagged explicitly.

---

## 0. TL;DR — three buckets

| Bucket | Items |
|---|---|
| **Knob-flip (`spec.py`)** | `SERIALIZATION=jcs` (already default — real lib is plain JCS, **no DSSE**), `ST_STRATEGY=flag` (compute the flag in the adapter), `COST_FLOW=full` (flat sum). |
| **Field remap (adapters, no engine change)** | All wire field names, cost cents↔CAD, derived-id↔explicit-id linking, registry shape. Lives in `attestation_from_dict`, `payload_dict`, `resolve_key`, `registry._normalize`, `get_costs`. |
| **Beyond the staged plan (real work)** | Float quantities (model touch, §4), the `POST /verify` contract + lowercase response enums (§10), percentage-over-**all**-nodes semantics (§9), new anomalies `parent_hash_mismatch`/`unit_mismatch`/`transformation_implausible`/`cost_anomaly` + the statistical `t4_*` detectors (§12), optional anchor-registry checks (§6). |

---

## 1. Wire attestation — field by field

**Our mock** (`schema/attestation.schema.json`, `backend/tests/fixtures/*`):

```json
{
  "supplier_id": "SUP-ALU",
  "output":   { "product_id": "raw_aluminum", "quantity": 1, "unit": "kg" },
  "inputs":   [ { "attestation_hash": "<sha256 hex>", "quantity_used": 1 } ],
  "materials_cents": 500,
  "labour_cents": 200,
  "work_country": "CA",
  "is_substantial_transformation": false,
  "timestamp": "2026-05-01T08:00:00Z",
  "signature": "<base64>"
}
```

**Their real** (`provenance-kit/spec/attestation-schema.md`):

```json
{
  "attestation_id": "att-018f4d2e-...",
  "version": "1.0",
  "supplier_id": "sup-avss-corp",
  "timestamp": "2026-04-15T14:30:00Z",
  "action_type": "component_manufacture",
  "performed_in_country": "CA",
  "parents": [ { "attestation_id": "att-...", "content_hash": "<sha256 hex>",
                 "quantity_consumed": 8.0, "unit": "m2" } ],
  "output": { "name": "Parachute Assembly", "quantity_produced": 1, "unit": "units" },
  "costs": { "material_cad": 0.0, "labour_hours": 6.5, "labour_cost_cad": 520.0 },
  "signature": { "algorithm": "ed25519", "value": "<base64>" }
}
```

| Concept | Mock field | Real field | Mapping action (in `attestation_from_dict`) |
|---|---|---|---|
| Issuer | `supplier_id` (`SUP-ALU`) | `supplier_id` (`sup-0001`) | pass through; **id format differs** (case), only matters for registry lookup |
| Node id | *(derived: `compute_hash`)* | `attestation_id` (explicit) | **structural — see §2** |
| Schema version | — | `version` `"1.0"` | ignore (or carry in annotations) |
| Step kind | — | `action_type` enum | **new** — needed for ST + plausibility (§8, §12) |
| Work location | `work_country` | `performed_in_country` | rename |
| Parents | `inputs[]` | `parents[]` | rename; **per-input `unit` + `attestation_id` are new** (§2, §12) |
| ↳ link key | `inputs[].attestation_hash` | `parents[].content_hash` | same role (hash-link); see §2 |
| ↳ quantity | `inputs[].quantity_used` (int) | `parents[].quantity_consumed` (**float**) | §4 |
| Output label | `output.product_id` | `output.name` | rename (display); note real `name` is not an id |
| Output qty | `output.quantity` (int) | `output.quantity_produced` (**float**) | §4 |
| Output unit | `output.unit` | `output.unit` | same |
| Material cost | `materials_cents` (int) | `costs.material_cad` (**float CAD**) | §3 |
| Labour cost | `labour_cents` (int) | `costs.labour_cost_cad` (**float CAD**) | §3 |
| Labour effort | — | `costs.labour_hours` (**float**) | **new** — drives ST (§8) |
| ST flag | `is_substantial_transformation` (bool) | *(derived from `action_type`+`labour_hours`)* | compute in adapter (§8) |
| Timestamp | `timestamp` | `timestamp` | same |
| Signature | `signature` (bare base64 string) | `signature.{algorithm,value}` (object) | unwrap `.value`; assert `.algorithm=="ed25519"` |

---

## 2. ID & linking model — the one structural difference

- **Mock:** an attestation has **no id of its own**; `compute_hash = SHA-256(canonicalize(payload))` *is* its identity. A child links to a parent via `inputs[].attestation_hash` (= parent's content hash). The store is **content-hash-addressed**; `/verify/{root_hash}` looks up by that hash.
- **Real:** an attestation carries an **explicit `attestation_id`** *and* the parent link carries **both** `parents[].attestation_id` **and** `parents[].content_hash`. The leaf is named by `product_attestation_id` (an `attestation_id`, not a hash).

**Mapping that preserves `chain.py` unchanged:** in the `POST /verify` handler (§10), for each submitted attestation compute its real content hash with `provenance-kit/reference_lib.content_hash`, build `{content_hash: node}`, set `InputRef.attestation_hash = parents[].content_hash`, and set the engine's `root_hash` = the content hash of the attestation whose `attestation_id == product_attestation_id`. The DAG then links exactly as today.

**But** the explicit id surfaces two checks the mock didn't need (because hash *was* the key):
- `dangling_parent` — `parents[].attestation_id` not present in the submission. (We have `BROKEN_LINK`; rekey it on attestation_id presence.)
- `parent_hash_mismatch` — `parents[].content_hash` ≠ recomputed `content_hash` of the parent found by `attestation_id`. (New explicit check; mock trusted the hash because it was the lookup key.)

➡️ Keep an `{attestation_id: node}` map alongside the content-hash map.

---

## 3. Cost model — integer cents vs CAD floats

- **Mock:** `materials_cents`, `labour_cents` (integers); money is integer cents everywhere above the adapter (`models.py` docstring).
- **Real:** `costs.material_cad`, `costs.labour_cost_cad` (CAD floats), plus `costs.labour_hours` (float, **not a cost**).

**Action in `attestation_from_dict` / `get_costs`:**
- `materials_cents = round(material_cad * 100)`, `labour_cents = round(labour_cost_cad * 100)`.
- Keep the internal cents core untouched. Rounding to the cent is **safe within the ±0.5% percentage tolerance** (sub-cent error ≪ 0.5%).
- `labour_hours` has no cents analog — carry it (annotations or a model field) for the ST rule.
- `get_costs` stays `(materials_cents, labour_cents, work_country)` with `COST_FLOW=full` (each node's own cost once, attributed by `performed_in_country`).

---

## 4. Quantity model — int vs float (⚠ model touch)

- **Mock:** `Output.quantity: int`, `InputRef.quantity_used: int`; schema enforces `integer`.
- **Real:** `quantity_produced` and `quantity_consumed` are **numbers** — fractional in the corpus (e.g. `0.237 kg`, `1.256 kg`, `8.0 m2`).

**Action:** widen `models.py` `Output.quantity` and `InputRef.quantity_used` to `float`, drop the `int(...)` casts in `attestation_from_dict`, and relax the schema to `number`. Mass-balance already uses `ε = 1e-6` float-safe comparison, so the algorithm is unaffected — only the types. *(This is one of the few `models.py` edits; see §13.)*

---

## 5. Registry & keys

- **Mock** (`data/registry.json`): `{ "SUP-ALU": { "public_key": "<hex>", "verified": true } }` — **hex** key, `verified` flag, 4 suppliers.
- **Real** (`provenance-kit/registry/supplier_public_keys.json`): `{ "version": "1.0", "keys": { "sup-0001": "<base64>" } }` — **base64** key, **no `verified`**, 69 suppliers.

**Action:**
- `registry._normalize`: add a branch for `{keys: {id: "<b64>"}}`. Map each to our internal `{id: (public_key, verified)}` with `verified=True` (real registry has no such concept; "unknown issuer" = id absent from `keys`).
- `resolve_key` is unchanged once `_normalize` yields the internal shape.
- Key decoding moves from hex to **base64** (the reference lib loads raw 32-byte keys from base64) — handled wherever we instantiate `Ed25519PublicKey` (best: delegate to `reference_lib.verify_attestation`).

---

## 6. Anchor registry — a new data source (optional, lower priority)

`provenance-kit/registry/anchor_registry.json`: `{version, authority_public_key, anchors:[{attestation_id, content_hash, product_id}] (3147), signature}`. **We have no analog.**

Enables two checks not in our pipeline:
- `anchor_mismatch` — an anchored `attestation_id`'s recomputed `content_hash` ≠ the anchored one (rewritten content).
- `replay_cross_chain` — an anchored attestation appears under a different `product_id`.

Note `spec/anchor-registry.md`: the registry is **not exhaustive** — absence is **not** a violation. Lower priority: the *training* corpus's replay family is `replay_within_chain` (which our `REPLAY_DETECTED` already models); anchor-based attacks may appear only in the held-out set.

---

## 7. Canonicalization, hashing, signature envelope

- **Mock:** `canonicalize` = JCS (`json.dumps(sort_keys, compact, ensure_ascii=False)`) or DSSE/PAE via `spec.SERIALIZATION`. `compute_hash = SHA-256(canonicalize(payload_dict))`. Signature is a bare base64 string over those bytes.
- **Real** (`provenance-kit/reference_lib/canonical.py`): JCS — sorted keys, compact, signature excluded, **whole-floats→int** (`1.0→"1"`, `520.0→"520"`), no trailing zeros (`520.5`), raw UTF-8 (non-ASCII not `\u`-escaped), no NaN/Inf. Signature is `{algorithm, value}`.

**Gotcha:** our `_jcs_bytes` uses Python `json.dumps`, which emits `520.0` and `1.0` as-is — **the real lib emits `520` and `1`.** These bytes differ → signatures/hashes won't match.

**Action (the safe path, already sanctioned by `02 §3`):** point `adapters.canonicalize`, `compute_hash`/`content_hash`, and `verify` at **`provenance-kit/reference_lib`** directly rather than reimplementing the number rules. `SERIALIZATION` stays `jcs`; DSSE is unused. Verified: the kit's golden-vector test passes in-tree (`python -m reference_lib.tests.test_golden`, 5/5).

---

## 8. Substantial-transformation rule

- **Mock:** `is_substantial_transformation` is a wire **bool**; `find_last_st` (`ST_STRATEGY=flag`) BFS root→leaves, first flagged wins = nearest to the leaf.
- **Real** (`spec/computation.md`): qualifies iff `action_type ∈ {component_manufacture, subassembly, final_integration}` **AND** `labour_hours ≥ 4`; "last" = closest to the product leaf.

**Action:** in `attestation_from_dict`, set
`is_substantial_transformation = (action_type in {component_manufacture, subassembly, final_integration}) and (labour_hours >= 4)`.
Then `ST_STRATEGY=flag` is correct as-is — our root **is** the product leaf, so "nearest-to-root flagged" = "last ST closest to leaf." No engine change. (No need for `activity` strategy.)

---

## 9. Percentage & designation semantics (⚠ confirm empirically)

- **Designation thresholds match exactly:** `≥98 → product_of_canada`, `≥51 → made_in_canada`, else/no-ST/total-0 → `none`; ST must be in CA. (Our enum is upper-case — see §10.)
- **Percentage formula matches:** flat `Σ(material+labour for CA) ÷ Σ all × 100` by node country (= `COST_FLOW=full`).
- **Divergence risk:** `spec/computation.md` computes the percentage/designation over **all attestations as submitted, regardless of anomalies**. Our pipeline (`01 §2`) **excludes a failed node from the cost sum** ("graceful degradation"). On the ~17% invalid chains this can produce a different number than the harness expects.
  ➡️ **Action:** confirm against the corpus with `self_test.py`; if it diverges, compute %/designation on the raw cost data first (always), and let anomalies affect only `chain_valid`/`anomalies`, not the cost sum. This is one place the "don't touch the engine" rule (`02 §9`) may itself need a small, deliberate change.

---

## 10. The `/verify` contract (⚠ beyond the staged plan)

- **Mock:** `POST /attestations` (ingest, returns hash) + `GET /verify/{root_hash}` → our `VerificationResult` shape (`designation` upper-case, `canadian_pct`, `*_cents`, `cost_by_country`, `graph`).
- **Real:** **`POST /verify`**, body `{product_attestation_id, attestations:[...]}` (whole chain, unspecified order, stateless), response:
  ```json
  { "product_attestation_id": "...", "canadian_content_percentage": 58.4,
    "designation": "made_in_canada", "chain_valid": true,
    "anomalies": [ { "type": "...", "attestation_id": "...", "details": "..." } ] }
  ```

`02 §9`/`03` assumed *the harness binds to our existing routes* — that's the **one staged assumption the real spec falsifies.** Fix is small and **additive**, not an engine rewrite:

**Add a `POST /verify` handler that:**
1. Builds each node via `attestation_from_dict`, computes content hashes via `reference_lib`, builds the DAG in-memory (no persistent store needed for the scored path).
2. Runs the existing verify engine.
3. Maps the internal `VerificationResult` → the spec response: `canadian_content_percentage = canadian_pct`; `designation` → **lower-case** (`PRODUCT_OF_CANADA→product_of_canada`, etc.); `chain_valid = (no non-advisory anomalies)`; each internal `Anomaly` → `{type, attestation_id, details}` (id = the offending node's `attestation_id`; see §12 for the `type` label map).

Keep the old routes for the demo UIs; the harness only calls `POST /verify`.

---

## 11. Consolidated adapter swap map (mirrors `02 §3`)

| Seam / fn (`backend/app/…`) | Mock body | Day-of action |
|---|---|---|
| `adapters.validate` | mock JSON-Schema | replace schema with the real wire shape (§1) or repoint |
| `adapters.canonicalize` | local JCS/DSSE | **call `reference_lib.canonical_serialize`** (§7); keep `SERIALIZATION=jcs` |
| `adapters.compute_hash` | local SHA-256 | **call `reference_lib.content_hash`** (§7) |
| `adapters.verify` | `pyca` Ed25519 | **call `reference_lib.verify_attestation`** (handles b64 key + `signature.value`) |
| `adapters.resolve_key` + `registry._normalize` | hex + `verified` | base64, `{keys}` branch, `verified=True` (§5) |
| `adapters.get_costs` | reads cents | `(round(material_cad*100), round(labour_cost_cad*100), performed_in_country)`; `COST_FLOW=full` (§3) |
| `adapters.find_last_st` | flag BFS | unchanged; derive the flag in `attestation_from_dict` (§8) |
| `adapters.attestation_from_dict` | mock fields | full remap (§1); compute id/hash, ST flag; **float** qtys (§4); unwrap signature |
| `adapters.payload_dict` | mock payload | mirror the real signed shape **exactly** — or skip entirely and hash/verify the raw wire dict via `reference_lib` (preferred; avoids drift) |
| `spec.SERIALIZATION / ST_STRATEGY / COST_FLOW` | jcs / flag / fraction | `jcs` / `flag` / **`full`** |
| `main.py` | GET-by-hash | **add `POST /verify`** (§10) |
| `models.py` | int qtys | widen quantities to float; carry `labour_hours`, `attestation_id`, per-input `unit` (§13) |

---

## 12. Anomaly type mapping (our `Reason` → their free-form `type`)

| Real `type` (corpus) | Our `Reason` | Status |
|---|---|---|
| `signature_invalid` | `SIGNATURE_INVALID` | ✅ have |
| `signature_unknown_supplier` | `UNKNOWN_ISSUER` | ✅ (rename label) |
| `circular_reference` | `CYCLE` | ✅ |
| `mass_balance_violation` | `MASS_BALANCE` | ✅ (now global, float) |
| `dangling_parent` | `BROKEN_LINK` | ✅ (rekey on attestation_id, §2) |
| `timestamp_inversion` | `TEMPORAL_INVERSION` | ✅ (rename label) |
| `replay_within_chain` | `REPLAY_DETECTED` | ✅ |
| `parent_hash_mismatch` | — | ⚠ **new** — content_hash recompute vs `parents[].content_hash` (§2) |
| `unit_mismatch` | — | ⚠ **new** — `parents[].unit` vs parent `output.unit` (we currently drop per-input unit, §1/§13) |
| `transformation_implausible` | — | ⚠ **new** — e.g. `final_integration` with no parents; semantic rule |
| `cost_anomaly` | (≈ advisory `LABOUR_COST_OUTLIER`) | ⚠ **promote** — labour-rate-outside-band; must enter the scored anomaly list |
| `t4_cost/timing/origin/labour_outlier` | (≈ advisory `ANOMALY` IsolationForest) | ⚠ **statistical** — learn the genuine distribution from `training_corpus.jsonl`; F1-scored on `t4_perturbed` |

> Output label convention: emit **snake_case** real types (above), not our upper-case
> `Reason` names. F1 scoring punishes over-flagging — do **not** surface advisory-only
> reasons (`HIGH_FOREIGN_DEPENDENCY`, etc.) as anomalies.

---

## 13. `models.py` changes required (the "frozen" exceptions)

`02 §9` lists `models.py` as must-not-change, but the real data forces a few minimal, deliberate edits (types/extra fields only — no behavioural logic):

- `Output.quantity: int → float`; `InputRef.quantity_used: int → float` (§4).
- `InputRef`: add `unit: str` (for `unit_mismatch`, §12) and optionally `attestation_id: str` (for `dangling_parent`/anchor, §2).
- `Attestation`: add `attestation_id: str`, `action_type: str`, `labour_hours: float` (and `version`); keep `is_substantial_transformation` as the derived convenience.
- `signature` stays a `str` internally; unwrap `signature.value` at the adapter.

Everything downstream (chain/verify/content/massbalance) keeps consuming the same internal types.

---

## 14. Silent-bug zone — re-confirm by hand

1. **Number canonicalization** (`520.0` vs `520`): the #1 signature-mismatch cause. Mitigated by using `reference_lib` (§7) — verify against the worked example first.
2. **Percentage over all-vs-valid nodes** (§9): re-confirm with `self_test.py`; quietly wrong on invalid chains otherwise.
3. **Float rounding to cents** (§3): fine within ±0.5%, but re-confirm the worked example reproduces `58.4%`.
4. **`chain_valid` definition**: real = "no integrity anomalies detected." Map from non-advisory anomalies only; advisory/statistical flags should still list in `anomalies` but think carefully about whether they flip `chain_valid` (the corpus has `chain_valid:true` rows that still carry `t4_perturbed`).

---

## 15. First milestone after the swap

1. Vendor reference lib into the backend path; `canonicalize`/`content_hash`/`verify` delegate to it.
2. `attestation_from_dict` + `payload_dict` remap; `models.py` widenings (§13).
3. `registry._normalize` `{keys}` branch; `spec.COST_FLOW=full`.
4. Add `POST /verify` (§10).
5. **Reproduce `worked-example/recovery_drone_expected.json` → `58.4% / made_in_canada / valid`.**
6. `python provenance-kit/self_test.py http://localhost:8000/verify` → baseline score; iterate on §12 detectors.

---

*RedTeam DefTech Ottawa · TrueNorth · companion to 01/02/03 · real-data gap & swap map*
