# Maple Ledger — Parallel Swap Plan: Completion Summary

> **As of 2026-05-30.** The parallel swap defined in `05-parallel-swap-plan.md` is
> **complete**: all 8 lanes (0, A–G) done, integrated on `laxmankc`, pushed to
> `main` (`735fdf2`), and validated on the live Docker stack. This is the
> authoritative status + test record. Companion to `04` (gap analysis), `05`
> (plan), `07` (interim lane results).

---

## 1. Lane status — all complete ✅

| Lane | Scope | Status | Commit |
|---|---|---|---|
| **0** Foundation | Real `POST /verify`, `reference_lib`, real registry, detector framework | ✅ | `f6205fb` (tag `foundation-frozen`) |
| **A** Computation correctness | %/designation over **all** attestations regardless of validity | ✅ | `7aa642b` |
| **B** Structural detectors | `parent_hash_mismatch`, `unit_mismatch`, `dangling_parent` | ✅ | `960906c` |
| **C** Semantic detectors | `transformation_implausible`, `cost_anomaly` | ✅ | `5270b17` |
| **D** Statistical (t4) | `t4_timing/origin/labour/cost` (learned from corpus) | ✅ | `c17fe19` |
| **E** Anchor registry | `anchor_mismatch`, `replay_cross_chain` | ✅ | `48d1cf3` |
| **F** Frontends | Purchaser + supplier UIs wired to real `POST /verify` | ✅ | `f52814b` |
| **G** Tests & harness | Real-format fixtures, golden regression, `run_selftest.py` | ✅ | `3a68981` (merged `fdbfaed`) |
| **+ bonus** | `replay_within_chain` (duplicate attestation_id) | ✅ | `3c269ef` |

`main` HEAD: `735fdf2`. Integration was conflict-free — each lane owned disjoint files (4 detector modules + verify.py + content.py + frontend/ + tests/), so merges/cherry-picks never collided.

---

## 2. Score progression (provenance-kit/self_test.py, 1000 chains)

| Milestone | Overall | clean |
|---|---|---|
| Lane 0 (rules-only foundation) | 80.6% | 100% |
| + B (structural) | 82.5% | 100% |
| + C + E (semantic, anchor) | 84.1% | 100% |
| + D (statistical t4) | 94.7% | 99.7% |
| + A (computation correctness) | 96.2% | 99.7% |
| **+ replay_within_chain** | **96.8%** | 99.7% |

**+16.2 points** over the foundation. Technical-Implementation criterion ≈ `10 × (96.8/100)` ≈ **9.7 / 10** on training data (the held-out set will run somewhat lower per the FAQ).

---

## 3. Test results

### 3.1 Backend grading — `self_test.py` (live container, 96.8%)

| Family | n | Score |
|---|---|---|
| clean | 705 | 99.7 |
| dangling_parent | 13 | 100.0 |
| signature_corrupt | 17 | 100.0 |
| mass_balance | 13 | 100.0 |
| transformation_implausible | 17 | 100.0 |
| unit_mismatch | 12 | 100.0 |
| t4_timing_outlier | 41 | 100.0 |
| cost_anomaly | 15 | 99.2 |
| replay_within_chain | 11 | 96.9 |
| tamper_no_resign | 7 | 96.7 |
| unknown_supplier | 15 | 92.2 |
| parent_hash_mismatch | 12 | 90.3 |
| timestamp_inversion | 20 | 85.0 |
| circular | 19 | 84.6 |
| t4_cost_outlier | 17 | 76.5 |
| t4_origin_outlier | 38 | 75.4 |
| t4_labour_outlier | 28 | 71.4 |
| **OVERALL** | **1000** | **96.8** |

### 3.2 Unit tests — `pytest backend/tests`
**76 passed** (was 26 failed / 50 passed before Lane G). Includes the worked-example golden regression (`test_worked_example_golden`) and a real-contract `POST /verify` smoke test. `backend/tests/realfixtures.py` regenerates every scenario as real-format chains signed with the kit's private keys via `reference_lib`.

### 3.3 Reference parity — `reference_lib` golden vectors
**5/5 passed** — byte-exact canonicalization + Ed25519 confirmed.

### 3.4 Frontend builds
Both Vite builds clean: purchaser `built in 378ms`, supplier `built in 237ms` (after `npm ci`). Supplier canonicalizer asserts `content_hash` byte-parity against the worked example.

### 3.5 Worked example (live `POST /verify`)
`{ "canadian_content_percentage": 58.4, "designation": "made_in_canada", "chain_valid": true, "anomalies": [] }` — exact match to `recovery_drone_expected.json`.

### 3.6 Live deployment
`docker compose up` → 3 containers healthy: `verifier-backend` (:8000, healthy), `purchaser-ui` (:5173 → 200), `supplier-ui` (:5174 → 200).

---

## 4. What each lane delivered

- **Lane 0** — `models.py` (real fields, float qty, `raw` wire dict, `Anomaly.type_label`), `adapters.py` (delegates canonical/hash/verify to vendored `reference_lib`; real `attestation_from_dict`, CAD→cents, derived ST flag), `registry.py` (real `{keys:{id:b64}}`), `spec.py` (`COST_FLOW=full`, `REPLAY_RULE=hash_only`), `verify.py` (stateless `verify_chain` + spec response mapper + detector hook), `main.py` (`POST /verify`), `detectors/` framework, `massbalance.py` ε. Vendored `provenance-kit/` + `.dockerignore`.
- **Lane A** — `verify.py`: percentage + designation are a flat sum over **every** submitted attestation regardless of validity; removed the failed-node exclusion and the anomaly→NONE override. Lifted signature_corrupt/mass_balance/transformation_implausible to 100.
- **Lane B** — `detectors/structural.py`: child-keyed `parent_hash_mismatch`/`unit_mismatch`/`dangling_parent` (dangling rekeyed on attestation_id).
- **Lane C** — `detectors/semantic.py`: non-raw transformation consuming nothing; labour-rate band [20,150] CAD/hr (corpus-calibrated).
- **Lane D** — `detectors/statistical.py` + `scripts/train_anomaly.py` + `backend/app/anomaly_model.json`: learns genuine-chain distributions; flags t4 timing/origin/labour/cost outliers; artifact loaded once at import.
- **Lane E** — `detectors/anchor.py`: loads the 3147-anchor registry once; `anchor_mismatch`/`replay_cross_chain`; absence ≠ violation. (No training lift — corpus is disjoint from anchors; value on held-out.)
- **Lane F** — `frontend/**`: purchaser loads a chain (worked-example button + paste) → `POST /verify` → renders the real response + a parents-derived graph; supplier form/signer match the real schema and `reference_lib` byte-for-byte.
- **Lane G** — `backend/tests/**` + `scripts/run_selftest.py`: translated all mock tests to real format, golden regression, one-command in-process scorer.
- **replay_within_chain** — `verify.py`: flags a duplicate `attestation_id` in the submission (needs the pre-dedup wire list).

---

## 5. Execution method (the parallelism)

Lane 0 landed first and was tagged `foundation-frozen`; the detector framework let Lanes B/C/D/E each own one file. Lanes ran as **background agents in isolated git worktrees** and were integrated by file-checkout / merge (disjoint files → conflict-free). Two integration fix-ups: Lane F's agent was sandbox-blocked from `npm`/`git` (left changes uncommitted + a missing `worked_example_chain.json` → created + committed + builds confirmed); Lane G had pinned a `replay_within_chain` "known-gap" test which was flipped to assert detection once the bonus fix landed. All worktrees removed after integration.

---

## 6. Remaining (out of `05` scope / diminishing returns)

The `05` plan is fully delivered. Optional further work:
- **t4 residuals** (labour 71.4, origin 75.4, cost 76.5) — the Lane D agent showed these are largely irreducible without hurting clean precision (some CA-sourced parts are legitimately rare; some inflated labour overlaps the clean tail).
- **`timestamp_inversion` 85.0 / `circular` 84.6 / `parent_hash_mismatch` 90.3** — minor.
- **Judge presentation** — 23 of 33 points are demo + presentation; the UIs are wired and demo-ready (see `07` for the click-through flow).
- **Submission packaging** — clean `docker compose up --build` from a fresh clone (verified) + README.

---

*RedTeam DefTech Ottawa · TrueNorth · 05 parallel-swap completion record · main 735fdf2*
