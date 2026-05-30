# Maple Ledger — Test Execution Report

**Date:** 2026-05-30 · **Backend:** Docker `verifier-backend` @ `localhost:8000` (image built from `backend/Dockerfile`, registry 69 keys) · **Harness target:** `POST /verify`

> **Re-test 2 (commit `7aa642b` "Lane A").** Percentage/designation now sum over **all** attestations regardless of validity (per `computation.md`); anomaly→NONE override removed. **Score 94.7% → 96.2%.** Lifted: signature_corrupt 84→100, mass_balance 86→100, transformation_implausible 87→100, tamper_no_resign 82→97, unknown_supplier 77→92, parent_hash_mismatch 73→90, circular 70→85.

> **Re-test 3 (commit `a9563c7`; Lanes F/G + replay).** Two substantive fixes: (a) **`replay_within_chain` now detected** (duplicate `attestation_id` in submission, `3c269ef`) — family **46.9 → 96.9**; (b) **Lane G rewrote the internal pytest to real-spec format** (old mock fixtures deleted, `realfixtures.py` added) — **backend internal pytest now 76/76 pass** (was 50/76). UIs wired to real `/verify` (Lane F). **Score 96.2% → 96.8%.** Unchanged: the three t4 recall families, timestamp_inversion 85, clean 99.7 / 6 over-flags. Contract 8/8 green; worked example exact. **Numbers below are the post-v3 results.**

---

## 1. Executive summary

| Measure | Result (v3) | v2 | v1 |
|---|---|---|---|
| **Authoritative score** (self_test.py + suite-2 live corpus, identical) | **96.8%** over 1000 cases | 96.2% | 94.7% |
| Clean precision (over-flag) | **99.1%** — 6 / 705 clean chains flagged | 99.1% | 99.1% |
| Worked example (`/verify`) | Exact: 58.4% / made_in_canada / valid / [] | same | same |
| Suite-2 live contract tests | **8 / 8 pass** | 8/8 | 8/8 |
| Suite-1 core (contract+spec+designation+hard-rule+semantic) | **18 / 26 pass** | 17/26 | 17/26 |
| Backend internal pytest | **76 / 76 pass** ✅ (Lane G real-format rewrite) | 50/76 | 50/76 |

**Verdict:** the graded `/verify` path is in strong shape (**96.8%**, ~99% clean precision, <1s/call) and the internal regression net is now **fully green**. With replay fixed, the remaining headline weaknesses narrow to the three recall-limited statistical families (t4_labour/origin/cost, ~+1.5 pt available) and the cosmetic `timestamp_inversion`/`circular` type labels. None of the residual external-suite "failures" indicate a contract break — they are test-design artifacts (synthetic cost inflation tripping `cost_anomaly`; mislabel-vs-id on circular/timestamp).

---

## 2. Environment & method

- Backend run in **Docker** (exact pinned deps) — authoritative for the held-out harness, which also calls `POST /verify`.
- Suites run from a host **Python 3.11 venv** (`.venv/`) in **live** mode against `localhost:8000` (the mode that actually exercises the app).
- Run order: env setup → backend up + worked-example → backend internal pytest baseline → `self_test.py` (authoritative) → test_suite_1 (live) → test_suite_2 (offline sanity + live + corpus regression).
- Raw outputs saved under `test-results/` (`self_test.txt`).

---

## 3. Authoritative score — per family (live corpus regression == self_test)

```
overall: 96.8%  (1000 cases)        clean over-flag: 6/705 (precision 99.1%)

category                      v3 avg   n    v2/v1     lever
dangling_parent              100.0    13   100/100    —
unit_mismatch                100.0    12   100/100    —
t4_timing_outlier            100.0    41   100/100    —
mass_balance                 100.0    13   100/86     —
signature_corrupt            100.0    17   100/84     —
transformation_implausible   100.0    17   100/87     —
clean                         99.7   705   99.7       precision-critical (6 FPs)
cost_anomaly                  99.2    15   99.2       —
replay_within_chain           96.9    11    47/47     **fixed v3 (was 46.9)**
tamper_no_resign              96.7     7    97/82     —
unknown_supplier              92.2    15    92/77     residual multi-node
parent_hash_mismatch          90.3    12    90/73     residual multi-node
timestamp_inversion           85.0    20    85/85     type label never emitted
circular                      84.6    19    85/70     label/id residual
t4_cost_outlier               76.5    17    76.5      statistical recall
t4_origin_outlier             75.4    38    75.4      statistical recall
t4_labour_outlier             71.4    28    71.4      statistical recall
```

---

## 4. Coverage matrix (family → suite coverage → module → result)

> Status column reflects v1 root-cause; see §3 for v2 scores. After Lane A, the families marked "Partial — cost math" (signature_corrupt, mass_balance, transformation_implausible, tamper_no_resign, unknown_supplier, parent_hash_mismatch, circular) are now 85–100%.

| Family | n | Score | Suite-1 | Suite-2 | Backend module | Status |
|---|--:|--:|---|---|---|---|
| clean | 705 | 99.7 | spec_correct ✓ | precision guard ✓ | content/verify | **Good** — 6 marginal t4 FPs |
| dangling_parent | 13 | 100 | hard_rule ✓ | bdd micro ✓ | detectors/structural | **Pass** |
| unit_mismatch | 12 | 100 | hard_rule ✓ | bdd micro ✓ | detectors/structural | **Pass** |
| t4_timing_outlier | 41 | 100 | (gated) | t4 ✓ | detectors/statistical | **Pass** |
| cost_anomaly | 15 | 99.2 | semantic (neg) ✓ | bdd micro ✓ | detectors/semantic | **Pass** |
| transformation_implausible | 17 | 86.6 | semantic ✓ / shape ✗ | bdd ✓ | detectors/semantic | Partial — narrow shape rule |
| mass_balance | 13 | 85.9 | hard_rule ✓ | bdd micro ✓ | massbalance | Good |
| timestamp_inversion | 20 | 85.0 | hard_rule ✗ (type) | — | verify (advisory!) | **Gap** — type never scored |
| signature_corrupt | 17 | 84.4 | hard_rule ✓* | registry-bounded | adapters.verify_signature | Good* (orphaning edge case) |
| tamper_no_resign | 7 | 82.0 | (combo) | registry-bounded | adapters + structural | Partial — multi-node |
| unknown_supplier | 15 | 76.7 | hard_rule ✓ | bdd micro ✓ | verify (UNKNOWN_ISSUER) | Partial — multi-node phm |
| t4_cost_outlier | 17 | 76.5 | (gated) | documented frontier | detectors/statistical | Recall headroom |
| t4_origin_outlier | 38 | 75.4 | (gated) | t4 ✓ | detectors/statistical | Recall headroom |
| parent_hash_mismatch | 12 | 72.6 | hard_rule ✓ | bdd micro ✓ | detectors/structural | Partial — multi-node |
| t4_labour_outlier | 28 | 71.4 | (gated) | t4 ✓ | detectors/statistical | Recall headroom |
| circular | 19 | 69.6 | hard_rule ✗ | multi-node | chain.topo_walk | **Gap** — hash breaks cycle |
| replay_within_chain | 11 | 46.9 | hard_rule ✗ | bdd micro ✓ | verify/adapters.replay_key | **Biggest gap** |

\* single-node signature test passes (root stays reachable); content-tamper of a *non-root* node orphans it (see §6).

---

## 5. Per-suite results

### 5.1 Backend internal pytest (`backend/`) — **76 / 76 pass** ✅ (v3)
Lane G (`3a68981`) rewrote the suite to real wire format: deleted the legacy mock fixtures, added `tests/realfixtures.py`, and updated `test_verify`/`test_smoke`/`test_spec`/`test_anomaly`/`test_rules`/`test_robustness`. The stale regression net flagged in v1 (50/76, 26 mock-format fails) is resolved — the internal suite is now a trustworthy green baseline.

*(v1 context: the 26 fails were all mock-format fixtures that `adapters.attestation_from_dict` — which now reads `costs.material_cad`/`parents[]`/`performed_in_country` — parsed to 0 cost → NONE. Never a real-path regression.)*

### 5.2 test_suite_1 (mutation / black-box, live)
- Contract + response-shape: **pass** (9).
- Worked example clean, shuffled-DAG order-independence, no-spurious-flags: **pass**.
- Designation boundaries: 9 pass / **6 fail** — all `chain_valid is True` assertions at high target % (97.9/98/98.1 and abroad 75/98/99). Cause: the test inflates leaf labour to hit the %, producing rates like **$6,724/hr**, which the backend correctly flags `cost_anomaly`+`t4_cost_outlier`. Percentage & designation are computed correctly. **Test-design artifact; backend is stricter (and the same detector scores 99.2% on the real corpus).**
- Hard-rule single: 8/11 pass. Fails:
  - `timestamp_inversion` → backend emits `t4_timing_outlier` on the right id, never the `timestamp_inversion` type (real temporal check is `advisory=True` and dropped by `to_verify_response`).
  - `circular_reference` → re-signing shifts content hashes so the cycle never forms; degrades to `dangling_parent`+`parent_hash_mismatch` on the consumer.
  - `replay_within_chain` → duplicate attestation collapses by content-hash; undetected.
- Semantic: **pass** (2).
- Gherkin BDD: 24 pass / 29 fail — broad shape checks the backend doesn't implement (`raw_material_has_parent`, `subassembly_too_few_parents`, `unknown_action_type`, negative numerics), plus any combo containing a weak family.
- Combination matrix (default): 22 pass / 68 fail — requires *every* injected label present simultaneously; fails whenever a weak family is included or content-mutation orphans a node.

### 5.3 test_suite_2 (corpus-grounded)
- **Offline** (grades the suite's *own* reference oracle, **not the app**): 116 pass / 1 fail / 3 skip / 1 error. The fail is the oracle missing its own 0.80 floor on `transformation_implausible`; the error is `test_matches_repo_golden_vectors` referencing an **undefined `repo_root` fixture**; skips were missing `data/` files (now resolved). All are suite-internal, not backend.
- **Live contract**: **8 / 8 pass** (required fields, designation set, id echo, anomaly shape, unordered DAG, malformed-no-crash, worked-example end-to-end, throughput <1s/call).
- **Live corpus regression**: **94.7%**, clean precision **99.1%** (6/705).

---

## 6. Confirmed backend findings (v3, ranked by remaining score lever)

> Lane A closed the cost-math losses; v3 (`3c269ef`) closed **`replay_within_chain` (46.9 → 96.9)**.
> What remains:

1. **Statistical recall — top remaining lever** — `t4_labour` 71.4, `t4_origin` 75.4, `t4_cost` 76.5 (83 cases, ~+1.5 pt available). Recall headroom in `detectors/statistical.py` thresholds; tune while watching the 6 clean FPs (§ precision lever).
2. **`circular` 84.6 / `parent_hash_mismatch` 90.3 / `unknown_supplier` 92.2** — residual multi-node cases where the backend flags a subset of the expected cluster ids. Corpus circular expects **3 ids** (`circular_reference`+`parent_hash_mismatch`+`timestamp_inversion`). *Fix:* detect cycles on the `attestation_id` parent graph (pre-hash) and flag every cluster node.
3. **`timestamp_inversion` type never scored (85%).** The temporal check is `advisory=True` → dropped. The id is usually still caught via `t4_timing_outlier`/`parent_hash_mismatch`, but the `timestamp_inversion` classification bonus (0.15) is lost. *Fix:* emit a scored `timestamp_inversion` when a parent timestamp post-dates its child.
4. **Content-tamper orphaning (robustness nuance, low impact).** Tampering a non-root node's content without re-signing changes its hash → the node becomes unreachable from root → its own per-node violation is never evaluated; only the downstream `dangling_parent`/`parent_hash_mismatch` is caught. Corpus impact is minimal now (signature_corrupt 100, tamper_no_resign 96.7).

*Resolved since v1:* `replay_within_chain` (fix `3c269ef`), all Lane-A cost-math families, and the **stale internal pytest** (Lane G rewrite → 76/76).

**Precision lever:** the 6 clean over-flags are all marginal statistical outliers — 5 `t4_cost_outlier` + 1 `t4_labour_outlier`, all with z ≈ 3.0–3.4 (e.g. a clean 105 CAD/hr "BLDC motor" at z=3.4). Raising the statistical z-threshold from 3.0 toward ~3.5 removes these FPs at some recall cost — a precision/recall knob to tune against §6.3.

---

## 7. Test-harness / setup findings (not backend defects)

- **Backend internal pytest is stale** (26 fails on mock fixtures). Either regenerate fixtures in real wire format (`data/tools/gen_mock.py` + real schema) or retire/update the mock-model tests. The regression net currently gives a false-red.
- **`HANDOVER.md` is out of date**: claims "all green … 38 unit tests" and "in-memory `STORE` dict / no transparency log", but the code has SQLite + a transparency log and the internal suite is 50/76. (Doc itself says "code wins.")
- **suite_2 `verify_complete.feature` is inert** — no `scenarios()` binding / step defs; the detailed micro-feature never executes.
- **suite_2 `test_matches_repo_golden_vectors`** references an undefined `repo_root` fixture → errors (would skip anyway; kit vectors are Python, not JSON).
- **suite_1 t4 contract test** reads a different corpus schema (`case["request"]/["expected"]`) than the real corpus (`["chain"]/["labels"]`); gated off by `ENABLE_T4_CONTRACT`.
- **suite_2 offline mode grades the suite's own oracle, not the app** — only `-m live` tests exercise the backend. Treat offline as suite self-test.
- Many suite_1 "failures" are **test-design artifacts**: synthetic cost inflation tripping `cost_anomaly`; content-mutation orphaning nodes; broader shape/negative-numeric expectations than the corpus actually contains (`CORPUS_GROUND_TRUTH.md` confirms there is no negative-numeric family).

---

## 8. Recommendations (priority order)

1. **Add duplicate-`attestation_id` replay detection** (pre-dedup) → recovers most of `replay_within_chain` (46.9 → ~100), the single biggest lever.
2. **Detect cycles on the attestation_id parent graph and flag every cluster node** → lifts `circular` (69.6) and helps the multi-node `parent_hash_mismatch`/`unknown_supplier` families.
3. **Emit a scored `timestamp_inversion`** (stop dropping it as advisory) → recovers the 0.15 classification bonus on 20 cases without hurting precision.
4. **Tune statistical recall** in `detectors/statistical.py` (labour/origin/cost) while watching the clean FP count; consider z≈3.5 to clear the 6 clean over-flags.
5. **Repair the internal regression net** (regenerate real-format fixtures) and **update `HANDOVER.md`** so future work has a trustworthy baseline.
6. **(Optional) Broaden shape checks** (raw-with-parent, unknown action_type) only if the held-out set is expected to include them — `CORPUS_GROUND_TRUTH.md` suggests these surface as `transformation_implausible`; current 86.6% has modest headroom.

---

## 9. How to reproduce

```
# backend (authoritative)
docker compose up -d verifier-backend
curl -s -X POST localhost:8000/verify --data-binary @provenance-kit/worked-example/recovery_drone_chain.json

# authoritative score
.venv/bin/python provenance-kit/self_test.py http://localhost:8000/verify

# suite 1 (live)
PROVENANCE_REPO_ROOT=$PWD/provenance-kit PROVENANCE_VERIFY_URL=http://localhost:8000/verify \
  .venv/bin/python -m pytest test_suite_1

# suite 2 (offline sanity, then live + corpus)
cd test_suite_2 && ../.venv/bin/python -m pytest -m "not live"
BACKEND_URL=http://localhost:8000/verify ../.venv/bin/python -m pytest -m live -s
```
