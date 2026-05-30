# Backend benchmark + T4 statistical model — real results (2026-05-30)

**Supersedes** the earlier mock-only numbers in this file. These are measured against
the **real `/verify`** over the full 1000-chain `provenance-kit/training_corpus.jsonl`,
using the official `self_test.py` scoring formula.

> ⚠️ **Caveat:** scored on the *training* corpus (the model is fit on its `clean`
> chains), so this is optimistic vs the held-out set — expect the official harness
> score to be somewhat lower. Use the **per-category ranking**, not the absolute, to
> decide where to spend effort.

---

## Headline

**overall: 96.2%** (1000 cases, 0 request errors)

| category | avg | n |
|---|---|---|
| clean | **99.7** | 705 |
| dangling_parent | 100.0 | 13 |
| mass_balance | 100.0 | 13 |
| signature_corrupt | 100.0 | 17 |
| transformation_implausible | 100.0 | 17 |
| unit_mismatch | 100.0 | 12 |
| t4_timing_outlier | 100.0 | 41 |
| cost_anomaly | 99.2 | 15 |
| tamper_no_resign | 96.7 | 7 |
| unknown_supplier | 92.2 | 15 |
| parent_hash_mismatch | 90.3 | 12 |
| timestamp_inversion | 85.0 | 20 |
| circular | 84.6 | 19 |
| t4_cost_outlier | 76.5 | 17 |
| t4_origin_outlier | 75.4 | 38 |
| t4_labour_outlier | 71.4 | 28 |
| **replay_within_chain** | **46.9** | 11 |

clean chains still falsely flagged: **6/705 (0.85%)** — all from the t4 lane
(`t4_cost_outlier`×5, `t4_labour_outlier`×1).

---

## ⚠️ Correction — benchmark-harness pitfall (important)

An earlier run of this benchmark reported only **30.3%**, with every chain flagged
`signature_unknown_supplier`. **That was a harness bug, not a backend bug.**

Cause: the in-process benchmark used `TestClient(app)` **without** the `with …`
context manager, so FastAPI's **lifespan never ran** and the module-global
`REGISTRY` stayed empty (`{}`) — `main.py:60` default, populated only in `lifespan`
(`main.py:39 REGISTRY = load_registry()`). With an empty registry,
`resolve_key(supplier_id, {})` fails for every supplier → `UNKNOWN_ISSUER`
(`verify.py:56–60`) → mapped to `signature_unknown_supplier`.

**Fix:** always benchmark with the app initialised:
```python
with TestClient(M.app) as client:   # fires lifespan -> REGISTRY loads (0 -> 69)
    ...
```
or run a real `uvicorn`/`docker compose` instance and hit it over HTTP. The corrected
run confirmed `REGISTRY: 0 → 69` and overall `30.3% → 96.2%`.

---

## What the T4 model is / how it's trained & served

- **Train (offline, no backend):** `scripts/train_anomaly.py` reads the genuine
  (`clean`) attestations and writes per-group baselines to
  `backend/app/anomaly_model.json` (labour-hours & labour-rate median+MAD per
  `action_type|product`, per-product country frequencies, canonical clock times).
  Re-run after any corpus change.
- **Serve (in `/verify`):** `detectors/statistical.py` loads that artifact **once at
  import** and flags the four `t4_*` families. `t4_labour` keys on **`labour_hours`**
  robust-z (this is what gets it to 71.4 — the earlier standalone mock that scored
  labour ≈ 0 used the wrong feature and was a redundant duplicate; removed).
- The trained model only shapes the `anomalies` part of the response; `%`/
  `designation`/`chain_valid` and the rule-based anomalies are separate code.

Model artifact stats (this run): `clean_rows=705, labour_groups=31, rate_groups=31,
origin_products=43, canonical_clock=['09:00:00','14:30:00']`.

---

## Findings & next levers

1. **Core compute is solid** — `clean` 99.7, `%`/designation correct on all 705
   clean chains, most rule families 90–100.
2. **T4 lane is healthy** — timing 100, cost 76.5, origin 75.4, labour 71.4. The only
   clean false positives in the whole corpus are 6 t4 hits — minor precision tuning.
3. **Biggest single gap: `replay_within_chain` 46.9** (rule lane, not t4). Then
   `circular` 84.6, `timestamp_inversion` 85.0, `parent_hash_mismatch` 90.3.
4. **Suggested order:** fix `replay_within_chain` first → then nudge the mid rule
   families → then squeeze t4 cost/origin/labour and trim the 6 clean FPs.

Reproduce: `with TestClient(app)` in-process over the corpus, or
`python provenance-kit/self_test.py http://localhost:8000/verify` against a running
backend.
