# Maple Ledger — Parallel Swap Implementation Plan

> **As of 2026-05-30.** Executes the gap analysis in `04-mock-vs-real-data-gap.md`
> against the real spec vendored at `provenance-kit/`. Goal: align the backend with
> the real data + `POST /verify` contract, reproduce the worked example, then climb
> the `self_test.py` score.
>
> **Parallelism principle:** one short **critical-path lane (Lane 0)** lands the shared
> contract (internal model, adapter boundary, `POST /verify` skeleton, detector plugin
> framework). After Lane 0's *interfaces are frozen*, Lanes A–G each own **disjoint
> files** and run fully in parallel — no two lanes edit the same file. See the
> ownership matrix (§5).

---

## 0. Strategy in one picture

```
            ┌─────────────────────────── Lane 0: Foundation (critical path) ───────────────────────────┐
            │ models types · reference_lib wiring · attestation_from_dict · POST /verify · detector fwk │
            └───────────────────────────────────────────┬───────────────────────────────────────────────┘
   interfaces frozen ──────────────────────────────────┤  (everything below codes against §1 contracts)
            ├─ Lane A  Computation correctness        (content.py)
            ├─ Lane B  Structural detectors NEW        (detectors/structural.py)
            ├─ Lane C  Semantic detectors              (detectors/semantic.py)
            ├─ Lane D  Statistical t4 detectors        (detectors/statistical.py + train script + artifact)
            ├─ Lane E  Anchor-registry detectors       (detectors/anchor.py)
            ├─ Lane F  Frontends (demo only)           (frontend/**)
            └─ Lane G  Tests & harness wiring          (backend/tests/**, scripts/**)
```

**Can start *before* Lane 0 finishes** (they only need the spec, already known):
- **Lane D** — the training script + feature extractor read `provenance-kit/training_corpus.jsonl` directly; offline, no backend dependency. Only the *detector integration* waits on §1.
- **Lane F** — code against the frozen `POST /verify` response JSON (§1.4), it's fixed by the spec.
- **Lane G** — build real-format fixtures from `worked-example/` + sampled corpus rows now.

---

## 1. Frozen interface contracts (the parallelism enabler)

Lane 0 lands these first and **freezes** them; every other lane codes against them.

### 1.1 Internal model (`models.py`, post-W0.1)
```python
Output(name: str, quantity_produced: float, unit: str)          # was product_id/quantity:int
InputRef(attestation_id: str, content_hash: str,                # was attestation_hash only
         quantity_consumed: float, unit: str)                   # was quantity_used:int
Attestation(attestation_id, version, supplier_id, timestamp,
            action_type: str, work_country: str,                # work_country = performed_in_country
            inputs: tuple[InputRef,...], output: Output,
            materials_cents: int, labour_cents: int,            # from material_cad/labour_cost_cad ×100
            labour_hours: float,
            is_substantial_transformation: bool,                # DERIVED in adapter (§04 §8)
            signature: str)                                     # unwrapped from signature.value
```
Mass-balance/percentage already float-safe; only types widen. `Node`/`Anomaly`/`VerificationResult` unchanged except `Anomaly` anomalies reference a node hash (response maps hash→attestation_id).

### 1.2 Detector plugin contract (`detectors/base.py`)
```python
@dataclass
class VerifyContext:
    nodes_by_hash:   dict[str, Node]   # content_hash -> Node
    nodes_by_att_id: dict[str, Node]   # attestation_id -> Node
    raw_by_att_id:   dict[str, dict]   # original wire dict (for re-hashing / fields not in model)
    root_hash:       str               # content hash of product_attestation_id's node
    product_attestation_id: str
    registry:        dict              # {supplier_id: (pubkey_b64, verified)}
    anchor_index:    dict              # {attestation_id: (content_hash, product_id)}

Detector = Callable[[VerifyContext], list[Anomaly]]   # additive; returns extra anomalies
REGISTRY: list[Detector]                               # assembled once in detectors/__init__.py
```
Rules every detector obeys: **pure & additive** (reads ctx, returns anomalies, no mutation of others' state); **conservative** (F1 — never flag clean nodes); emits **snake_case** `type` labels (§04 §12).

### 1.3 Engine extension point
`verify.py` (frozen after Lane 0) produces the base result + core anomalies, then calls
`run_detectors(ctx)` which folds in `REGISTRY` outputs. Existing core checks (signature,
unknown-issuer, cycle, mass-balance, temporal, replay) **stay where they are**; new lanes
only add detector modules.

### 1.4 `POST /verify` response (spec-fixed)
```json
{ "product_attestation_id": "...", "canadian_content_percentage": 58.4,
  "designation": "made_in_canada", "chain_valid": true,
  "anomalies": [ { "type": "...", "attestation_id": "...", "details": "..." } ] }
```
`designation` lower-case; `chain_valid = (no non-advisory anomalies)`.

---

## 2. Lane 0 — Foundation (critical path · single owner · land fast)

| Task | What | Files |
|---|---|---|
| **W0.1** | Widen model types + add fields (§1.1) | `backend/app/models.py` |
| **W0.2** | Make `provenance-kit/reference_lib` importable by the backend (copy into image / add to path). `adapters.canonicalize`→`canonical_serialize`, `compute_hash`→`content_hash`, `verify`→`verify_attestation` | `backend/app/adapters.py`, `backend/Dockerfile`, `docker-compose.yml` |
| **W0.3** | `attestation_from_dict` + `payload_dict` full remap (§04 §1): real fields→internal, derive ST flag (§04 §8), `get_costs` cents-from-CAD, `resolve_key`/`registry._normalize` `{keys}` branch (§04 §5) | `backend/app/adapters.py`, `backend/app/registry.py` |
| **W0.4** | Add `POST /verify`: parse `{product_attestation_id, attestations}`, build DAG in-memory, run engine, map → spec response (§1.4, lower-case designation) | `backend/app/main.py` |
| **W0.5** | Detector framework: `detectors/` package, `base.py` (§1.2), `__init__.py` REGISTRY, **stub modules** `structural.py`/`semantic.py`/`statistical.py`/`anchor.py` each `return []` | `backend/app/detectors/*` (new) |
| **W0.6** | `run_detectors(ctx)` hook in the verify path; build `VerifyContext` in the `POST /verify` handler | `backend/app/verify.py` (hook only), `backend/app/main.py` |
| **W0.7** | Flip `spec.COST_FLOW=full`; keep `SERIALIZATION=jcs` | `backend/app/spec.py`, `docker-compose.yml` |

**Exit gate (unblocks A–G):** `docker compose up` healthy; `POST /verify` on the **worked
example** returns `58.4% / made_in_canada / chain_valid:true` with **no detectors active**
(empty `anomalies`); `self_test.py` runs end-to-end (score low but no crashes).

---

## 3. Parallel lanes (after Lane 0 interface freeze)

### Lane A — Computation correctness
- **Scope:** percentage over **all** nodes regardless of validity (§04 §9 divergence fix); designation thresholds 98/51 inclusive; `total==0 → none`; attribute by `work_country`.
- **Owns:** `backend/app/content.py` (+ `backend/tests/test_content_real.py`).
- **Exit:** on a corpus subset, %/designation match labels within ±0.5 for **both clean and invalid** chains.
- **Depends:** §1.1. **Start:** after Lane 0.

### Lane B — Structural detectors (the net-new ones)
- **Scope:** `parent_hash_mismatch` (recompute `content_hash`, compare to `parents[].content_hash`, §04 §2), `unit_mismatch` (`parents[].unit` vs parent `output.unit`), `dangling_parent` rekey on `attestation_id`. (Cycle/mass-balance/signature/temporal/replay already in the engine — only label remap, done in W0.4.)
- **Owns:** `backend/app/detectors/structural.py` + `tests/test_det_structural.py`.
- **Exit:** F1 ≈ 1.0 on corpus families `parent_hash_mismatch`, `unit_mismatch`, `dangling_parent`.
- **Depends:** §1.2, `raw_by_att_id`. **Start:** after Lane 0.

### Lane C — Semantic detectors
- **Scope:** `transformation_implausible` (e.g. `final_integration`/`subassembly` with no parents, or transformation that "consumes nothing"; ST-typed node with no inputs) and `cost_anomaly` (labour rate = `labour_cost_cad / labour_hours` outside a plausible band; band derived from corpus, hand-tuned).
- **Owns:** `backend/app/detectors/semantic.py` + `tests/test_det_semantic.py`.
- **Exit:** strong F1 on `transformation_implausible` (17) and `cost_anomaly` (15) families without hurting clean precision.
- **Depends:** §1.2. **Start:** after Lane 0 (band calibration can use the corpus now).

### Lane D — Statistical t4 detectors (the leaderboard lane)
- **Scope:** learn the genuine-chain distribution and flag `t4_cost/timing/origin/labour` outliers. Per-group baselines (by `action_type` / `output.unit` / country) — robust z-score / percentile bands / IsolationForest. Tune for **F1 on `t4_perturbed`** without tanking clean precision.
- **Owns:** `backend/app/detectors/statistical.py`, `scripts/train_anomaly.py`, model artifact `backend/app/models_data/anomaly.pkl`, `tests/test_det_statistical.py`. Load artifact **once at startup** (FAQ: don't reload per request).
- **Exit:** measurable F1 lift on the four `t4_*` buckets in `self_test.py`; clean-chain precision unchanged.
- **Depends:** §1.2 for integration only. **Start: NOW** — training script + feature extractor read the corpus directly, independent of Lane 0.

### Lane E — Anchor-registry detectors (optional / lower priority)
- **Scope:** load `provenance-kit/registry/anchor_registry.json` once → `anchor_index`; `anchor_mismatch` (recomputed hash ≠ anchored), `replay_cross_chain` (anchored att under a different `product_id`). Absence ≠ violation (§04 §6).
- **Owns:** `backend/app/detectors/anchor.py` + loader + `tests/test_det_anchor.py`.
- **Exit:** no regressions; flags synthetic anchor-tamper fixtures.
- **Depends:** §1.2, `anchor_index` in ctx. **Start:** after Lane 0; lowest priority (training corpus barely exercises it).

### Lane F — Frontends (demo only, not harness-scored)
- **Scope:** purchaser binds to the real `POST /verify` response (§1.4) — add a thin client/adapter (or a compat endpoint); supplier signer matches `reference_lib` canonicalization + real schema field names (`02 §5`). Demo-only; time-permitting.
- **Owns:** `frontend/purchaser/**`, `frontend/supplier/**`.
- **Exit:** purchaser resolves the worked example live; supplier produces an attestation that verifies green.
- **Depends:** §1.4 only. **Start: NOW** (response shape is spec-fixed).

### Lane G — Tests & harness wiring
- **Scope:** real-format fixtures from `worked-example/` + sampled corpus rows; a one-command `self_test` runner against the container; golden regression on the worked example; keep relevant old fixtures translated.
- **Owns:** `backend/tests/fixtures_real/**`, `backend/tests/test_worked_example.py`, `scripts/run_selftest.py`.
- **Exit:** `python scripts/run_selftest.py` prints the per-category score table; worked-example regression locked.
- **Depends:** §1.4 for the runner. **Start: NOW** (fixtures from the kit).

---

## 4. Dependency & sequencing

```
NOW (no wait):           D(train) ─┐   F(against spec) ─┐   G(fixtures) ─┐
                                   │                     │               │
Lane 0 (critical) ───── freeze §1 ─┴── A ── B ── C ── D(integrate) ── E ─┴── F(wire) ─┴── G(runner)
                                       └────────── all parallel ──────────┘
```
- **Only blocker:** Lane 0's §1 freeze. Keep Lane 0 small and fast (types + wiring + stubs), do **not** put detector logic in it.
- D/F/G have a "head start" half that needs no backend.

---

## 5. File-ownership matrix (conflict-avoidance guarantee)

| File / dir | Owner | Notes |
|---|---|---|
| `backend/app/models.py` | **Lane 0** | types only; frozen after |
| `backend/app/adapters.py` | **Lane 0** | mapping + reference_lib delegation |
| `backend/app/registry.py` | **Lane 0** | `{keys}` branch |
| `backend/app/main.py` | **Lane 0** | `POST /verify` |
| `backend/app/verify.py` | **Lane 0** | `run_detectors` hook only; otherwise frozen |
| `backend/app/spec.py`, `docker-compose.yml`, `Dockerfile` | **Lane 0** | COST_FLOW, reference_lib path |
| `backend/app/detectors/base.py`, `__init__.py` | **Lane 0** | framework + REGISTRY |
| `backend/app/content.py` | **Lane A** | percentage/designation |
| `backend/app/detectors/structural.py` | **Lane B** | one file |
| `backend/app/detectors/semantic.py` | **Lane C** | one file |
| `backend/app/detectors/statistical.py` + `scripts/train_anomaly.py` + artifact | **Lane D** | one file each |
| `backend/app/detectors/anchor.py` | **Lane E** | one file |
| `frontend/**` | **Lane F** | no backend overlap |
| `backend/tests/**`, `scripts/run_selftest.py` | **Lane G** | tests own their files |

➡️ After Lane 0, **no two lanes share a file** — clean parallel branches/worktrees.

---

## 6. Execution mechanics (how to actually run in parallel)

1. **Land Lane 0 on `laxmankc`** (or a `swap-foundation` branch), merge, tag the commit `foundation-frozen`.
2. Each lane = its **own branch off `foundation-frozen`** (or a git **worktree** per lane / per agent). Because ownership is disjoint (§5), merges are conflict-free except trivial REGISTRY imports (already stubbed in Lane 0).
3. Optional: spin a background agent per lane (worktree isolation). Each lane's exit gate is independently testable (`pytest tests/test_det_*.py`).
4. Integrate by merging lanes back in any order; run the full gate (§7) after each merge.

---

## 7. Integration & validation gates

| Gate | Command | Pass condition |
|---|---|---|
| G1 worked example | `POST /verify` ← `provenance-kit/worked-example/recovery_drone_chain.json` | `58.4% / made_in_canada / valid` |
| G2 reference parity | `python -m reference_lib.tests.test_golden` (in-tree) | 5/5 |
| G3 baseline | `python provenance-kit/self_test.py http://localhost:8000/verify` | runs; record per-category table |
| G4 core correctness | self_test `clean` + designation buckets | %/designation high; clean precision = 1.0 |
| G5 detector F1 | self_test per attack family | each lane lifts its family without hurting `clean` |
| G6 regression | `pytest backend/tests` | green (translated fixtures) |

---

## 8. Priority by score impact (where to spend effort)

1. **Lane 0 + G1/G2** — nothing scores until `POST /verify` + byte-exact crypto work.
2. **Lane A** — %/designation = 0.50 of every non-t4 case; the cheapest big win.
3. **Lane B + C** — hard-rule anomaly F1 (0.35) + classification (0.15); high confidence, low risk.
4. **Lane D** — the t4 buckets (~12% of cases, F1-only, weighted hard); the leaderboard lane, highest effort.
5. **Lane E** — marginal on training data; do if time remains.
6. **Lane F** — not harness-scored, but 23 of 33 judged points ride on the demo — don't skip before the presentation.

---

*RedTeam DefTech Ottawa · TrueNorth · companion to 04 · parallel swap execution plan*
