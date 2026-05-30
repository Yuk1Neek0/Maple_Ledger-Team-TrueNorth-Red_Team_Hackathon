# Maple Ledger — Lane Results & Next Steps

> **As of 2026-05-30.** Outcome of the parallel swap executed per
> `05-parallel-swap-plan.md` against the real spec (`provenance-kit/`). Lane 0
> (foundation) plus the four detector lanes (B/C/D/E) are implemented, merged on
> `laxmankc`, and validated on the live Docker container.

---

## 1. Headline result

`python provenance-kit/self_test.py http://localhost:8000/verify` — **94.7%** over
1,000 training chains (live container; identical in-process). Worked example exact
(`58.4% / made_in_canada / valid / []`).

| Stage | Overall | clean | Δ |
|---|---|---|---|
| Lane 0 (foundation, rules-only) | 80.6% | 100% | — |
| + Lane B (structural) | 82.5% | 100% | +1.9 |
| + Lane C + E (semantic, anchor) | 84.1% | 100% | +1.6 |
| **+ Lane D (statistical t4)** | **94.7%** | 99.7% | +10.6 |

**+14.1 points** over the foundation. Technical-Implementation criterion ≈ `10 ×
(94.7/100)` ≈ **9.5 / 10** on training; the held-out set will be slightly lower.

---

## 2. What each lane delivered

Each lane was built by a background agent in its own git worktree, owning exactly
one detector file (Lane D also a trainer + artifact). Files were disjoint →
conflict-free integration. Commit chain on `laxmankc`:
`f6205fb` Lane 0 (tag `foundation-frozen`) → `960906c` B → `48d1cf3` E →
`5270b17` C → `c17fe19` D.

### Lane 0 — Foundation (`models`, `adapters`, `registry`, `verify`, `main`, `detectors/`)
Real-spec `POST /verify`; crypto/canonicalization delegated to the vendored
byte-exact `reference_lib`; real `{keys}` registry (69 suppliers); `COST_FLOW=full`;
`REPLAY_RULE=hash_only`; mass-balance ε; the detector plugin framework. Clean 100%,
no over-flagging — the correct rules core.

### Lane B — `detectors/structural.py`
`parent_hash_mismatch`, `unit_mismatch`, `dangling_parent` — all reported on the
**child** (the consumer carrying the bad reference), `dangling_parent` rekeyed on
`attestation_id` (attackers fake the `content_hash` to a present node, so the
engine's hash-based link check misses it). Results: unit_mismatch **100**,
dangling_parent **100**, parent_hash_mismatch anomaly-F1 = 1.0.

### Lane C — `detectors/semantic.py`
`transformation_implausible` (a non-raw transformation — `component_manufacture`/
`subassembly`/`final_integration` — that consumes nothing) → **86.6**;
`cost_anomaly` (labour rate outside **[20,150] CAD/hr**, calibrated from the clean
corpus span 40–141.63) → **99.2**. Zero clean false positives.

### Lane D — `detectors/statistical.py` + `scripts/train_anomaly.py` + `backend/app/anomaly_model.json`
Learns genuine-chain distributions offline → compact JSON artifact, loaded once at
import. Four signals: **timing** (genuine stamps sit on canonical 09:00/14:30 clock)
→ **100**; **origin** (a raw material sourced from a country never seen for that
product) → **75.4**; **labour_hours** robust-z → **71.4**; **labour-rate** robust-z →
**76.5**. Tuned for net `self_test` delta (high t4 recall, ~0 clean FP). clean → 99.7
(6/705 single false flags).

### Lane E — `detectors/anchor.py`
`anchor_mismatch` (anchored attestation whose recomputed hash differs) and
`replay_cross_chain` (anchored attestation under a different product). Loads the
3,147-anchor registry once. The training corpus is **disjoint** from the anchors
(0/1000), so no training lift and no false positives — value is on the held-out set.
Synthetic tamper demo fired correctly.

---

## 3. Per-family scorecard (live container)

| Family | n | Score | Owner |
|---|---|---|---|
| clean | 705 | 99.7 | — |
| unit_mismatch | 12 | **100** | B |
| dangling_parent | 13 | **100** | B |
| t4_timing_outlier | 41 | **100** | D |
| cost_anomaly | 15 | 99.2 | C (+D) |
| transformation_implausible | 17 | 86.6 | C |
| mass_balance | 13 | 85.9 | Lane 0 |
| timestamp_inversion | 20 | 85.0 | Lane 0 (+D timing) |
| signature_corrupt | 17 | 84.4 | Lane 0 |
| tamper_no_resign | 7 | 82.0 | Lane 0 |
| unknown_supplier | 15 | 76.7 | Lane 0 |
| t4_cost_outlier | 17 | 76.5 | D |
| t4_origin_outlier | 38 | 75.4 | D |
| parent_hash_mismatch | 12 | 72.6 | B (pct residual = A) |
| t4_labour_outlier | 28 | 71.4 | D |
| circular | 19 | 69.6 | Lane 0 |
| replay_within_chain | 11 | 46.9 | — (open) |

**Interaction note:** D's origin signal occasionally flags a different attestation
on content-rewrite chains, pulling `parent_hash_mismatch` 82→72.6 — a ~1pt cost vs.
the ~28pt origin gain, kept deliberately. D's timing/rate signals also lifted
`timestamp_inversion` and `cost_anomaly` as a positive side effect.

---

## 4. Validation gates (all passed)

- G1 worked example (live `POST /verify`): 58.4 / made_in_canada / valid / [] ✓
- G2 `reference_lib` golden vectors: 5/5 ✓
- G3 self_test runs end-to-end (live + in-process parity): 94.7% ✓
- G4 clean precision: 99.7% (no systemic over-flagging) ✓
- Integration: 4 lanes = 4 disjoint detector files (+ trainer + artifact); merges conflict-free ✓

---

## 5. Next steps (by score impact)

### A. Lane A — computation correctness (highest remaining lever)
Compute `canadian_content_percentage` / `designation` over **all** attestations
regardless of validity (`spec/computation.md`), instead of excluding engine-failed
nodes (`04 §9`). This recovers the pct (0.30) + designation (0.20) residual on every
node-failing family — most visibly `parent_hash_mismatch` (72.6), and partially
`signature_corrupt` / `dangling_parent` / `mass_balance`. Owns `content.py` only.
Estimated **+1–2 pts**. Confirm empirically with `self_test` (clean must stay ~100%).

### B. Low-hanging detector gains
- `replay_within_chain` (46.9, 11 cases): the real within-chain replay = a repeated
  `attestation_id` (or a node consuming the same parent twice) — implement a proper
  detector (we currently disable the over-eager serial key). ~+0.5 pt.
- `circular` (69.6) and `unknown_supplier` (76.7): inspect why partial — likely the
  pct/designation residual again (overlaps with Lane A) or an off-by-one in scoping.

### C. Lane G — test translation (correctness hygiene, not score)
~26 legacy mock pytest failures (`test_verify`/`test_spec`/`test_smoke`) broke under
Lane 0's data-model swap. Translate fixtures to the real wire format + add a
worked-example regression test. Protects against future regressions.

### D. Lane F — frontends (demo; 23 of 33 judged points)
Wire the purchaser UI to the real `POST /verify` response shape and the supplier
signer to `reference_lib`. Not harness-scored, but the demo + presentation carry most
of the non-automated points.

### E. Submission packaging
Clean `docker compose up --build` from a fresh clone; README on how to run; confirm
service name/port. A packaged submission that scores beats a better one that never
ships.

**Recommended order:** A (cheap, broad) → B (cheap) → then parallelize G (tests) +
F (frontends) → E (package). The held-out set will run lower than 94.7%, so the
correctness-core gains (A/B) are the safest investment before the deadline.

---

*RedTeam DefTech Ottawa · TrueNorth · companion to 04/05 · lane results + roadmap*
