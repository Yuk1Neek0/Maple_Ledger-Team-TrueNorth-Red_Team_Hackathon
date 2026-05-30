"""Lane D — offline trainer for the statistical (t4) anomaly model.

Reads the labelled training corpus, learns the distribution of GENUINE
(clean) attestations, and writes a COMPACT JSON artifact consumed once at
startup by ``backend/app/detectors/statistical.py``.

The artifact is pure learned statistics (robust medians/MAD, country
frequencies, canonical timestamp clock-times) — no pickled model — so it is
portable and ships inside the backend image. Re-run after any corpus change:

    python scripts/train_anomaly.py

Four genuine-vs-attack signals are modelled (see 04/05 + provenance-kit FAQ):

* t4_timing  — genuine timestamps sit on a tiny set of canonical wall-clock
               times (09:00:00Z raw, 14:30:00Z transforms). Perturbed nodes
               carry an arbitrary HH:MM:SS.
* t4_origin  — a raw material's ``performed_in_country`` that is rare/never
               seen for that product in genuine chains (attack re-sources a
               foreign part to CA to inflate Canadian content).
* t4_labour  — a transformation whose ``labour_hours`` is a high outlier for
               that (action_type, product).
* t4_cost    — a transformation whose labour RATE (labour_cost/labour_hours)
               is a high outlier for that (action_type, product) while hours
               look normal.

Thresholds were grid-tuned on the corpus for max t4 F1 subject to keeping the
clean false-positive rate ~0 (see scripts/_tune.py during development).
"""
from __future__ import annotations

import json
import os
import statistics
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, "provenance-kit", "training_corpus.jsonl")
OUT = os.path.join(ROOT, "backend", "app", "anomaly_model.json")

ST_ACTIONS = ("component_manufacture", "subassembly", "final_integration")
# Genuine attestations use a tiny set of canonical wall-clock times.
CANONICAL_CLOCK = ("09:00:00", "14:30:00")
MIN_GROUP = 8          # need this many clean samples before a group is trusted
MIN_ORIGIN_SAMPLES = 12  # product needs this many clean raws before origin is scored


def _is_clean(row: dict) -> bool:
    # Clean rows simply omit the ``attack`` label.
    return row["labels"].get("attack", "clean") == "clean"


def _clock(ts: str) -> str:
    return ts.split("T", 1)[1].rstrip("Z") if "T" in ts else ""


def _mad(xs: list[float]) -> float:
    m = statistics.median(xs)
    return statistics.median([abs(x - m) for x in xs])


def _robust(xs: list[float]) -> dict:
    """Median + (normalised) MAD. Falls back to a small floor so a degenerate
    zero-spread group can't make every peer look infinitely anomalous."""
    med = statistics.median(xs)
    mad = _mad(xs)
    scale = 1.4826 * mad
    if scale <= 0:
        # near-constant group: use a tiny relative floor so only gross
        # deviations score; avoids divide-by-zero false positives.
        scale = max(abs(med) * 0.05, 1.0)
    return {"med": round(med, 4), "scale": round(scale, 4), "n": len(xs)}


def main() -> None:
    rows = [json.loads(l) for l in open(CORPUS, encoding="utf-8")]

    lh_by: dict = defaultdict(list)        # (action, name) -> labour_hours
    rate_by: dict = defaultdict(list)      # (action, name) -> labour_cost/labour_hours
    origin_by: dict = defaultdict(lambda: defaultdict(int))  # name -> {country: count}
    clocks: dict = defaultdict(int)

    n_clean = 0
    for row in rows:
        if not _is_clean(row):
            continue
        n_clean += 1
        for a in row["chain"]["attestations"]:
            c = a.get("costs", {}) or {}
            o = a.get("output", {}) or {}
            act = a.get("action_type", "")
            lh = float(c.get("labour_hours", 0) or 0)
            lc = float(c.get("labour_cost_cad", 0) or 0)
            clocks[_clock(a.get("timestamp", ""))] += 1
            if act in ST_ACTIONS and lh > 0:
                key = f"{act}|{o.get('name', '')}"
                lh_by[key].append(lh)
                rate_by[key].append(lc / lh)
            if act == "raw_material_supply":
                origin_by[o.get("name", "")][a.get("performed_in_country", "")] += 1

    # ---- labour-hours model: per (action,name) robust stats ----
    labour_groups = {k: _robust(v) for k, v in lh_by.items() if len(v) >= MIN_GROUP}
    # ---- labour-rate model: per (action,name) robust stats ----
    rate_groups = {k: _robust(v) for k, v in rate_by.items() if len(v) >= MIN_GROUP}
    # global rate fallback (for products with too few clean samples)
    all_rates = [r for v in rate_by.values() for r in v]
    rate_global = _robust(all_rates) if all_rates else {"med": 80.0, "scale": 20.0, "n": 0}

    # ---- origin model: per product, fraction of clean raws from each country ----
    origin = {}
    for name, counts in origin_by.items():
        tot = sum(counts.values())
        if tot >= MIN_ORIGIN_SAMPLES:
            origin[name] = {
                "n": tot,
                "freq": {ct: round(cnt / tot, 4) for ct, cnt in counts.items()},
            }

    # canonical clock times that actually dominate the clean corpus
    canon = sorted({t for t, n in clocks.items()
                    if n >= 5 and t in CANONICAL_CLOCK}) or list(CANONICAL_CLOCK)

    artifact = {
        "_meta": {
            "clean_rows": n_clean,
            "labour_groups": len(labour_groups),
            "rate_groups": len(rate_groups),
            "origin_products": len(origin),
        },
        # --- tuned thresholds (grid-searched on the corpus for max NET
        # self_test delta: high t4 recall with clean false positives ~0) ---
        "thresholds": {
            "labour_hours_z": 3.0,    # robust-z of labour_hours vs (action,name) peers
            "rate_z": 3.0,            # robust-z of labour rate vs (action,name) peers
            "rate_global_z": 4.0,     # fallback when product has no rate group
            "origin_max_freq": 0.0,   # flag origin only on never-CA products (freq==0)
            "origin_min_total": MIN_ORIGIN_SAMPLES,
        },
        "canonical_clock": canon,
        "labour_hours": labour_groups,
        "labour_rate": rate_groups,
        "labour_rate_global": rate_global,
        "origin": origin,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(artifact, f, separators=(",", ":"), sort_keys=True)
    print(f"wrote {OUT}")
    print(f"  clean_rows={n_clean} labour_groups={len(labour_groups)} "
          f"rate_groups={len(rate_groups)} origin_products={len(origin)} "
          f"canonical_clock={canon}")


if __name__ == "__main__":
    main()
