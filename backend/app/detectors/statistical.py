"""Lane D — statistical (t4) detectors — the leaderboard lane.

Genuine supply-chain attestations follow tight, learnable distributions. The
t4 attack families break NO hard rule but sit in the tails of those
distributions. We learn the genuine distribution offline
(``scripts/train_anomaly.py`` -> ``anomaly_model.json``) and flag the outliers
here. Four signals, one per family (labels are a bonus — t4 scoring only cares
that the right attestation_id is flagged):

* ``t4_timing_outlier``  — genuine timestamps sit on a tiny set of canonical
  wall-clock times (09:00:00Z for raw supply, 14:30:00Z for transformations).
  A perturbed node carries an arbitrary HH:MM:SS. Near-perfect separation.
* ``t4_origin_outlier``  — a raw material whose ``performed_in_country`` is one
  that essentially never sources that product in genuine chains (the attack
  re-sources a foreign part to CA to inflate Canadian content). Only products
  that are genuinely never-CA are scored, to protect clean precision.
* ``t4_labour_outlier``  — a transformation whose ``labour_hours`` is a high
  robust-z outlier for its (action_type, product) peer group.
* ``t4_cost_outlier``    — a transformation whose labour RATE
  (labour_cost / labour_hours) is a high robust-z outlier for its
  (action_type, product) peer group, while hours look normal.

The artifact is loaded ONCE at import (never per request — see provenance-kit
FAQ "avoid reloading models on every request"). All thresholds live in the
artifact so retuning never touches code.
"""
from __future__ import annotations

import json
import os

from .base import VerifyContext, anomaly

_ST_ACTIONS = {"component_manufacture", "subassembly", "final_integration"}
_MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "anomaly_model.json")


def _load_model() -> dict:
    """Load the trained artifact once. On any failure, return an inert model so
    the detector degrades to a no-op rather than sinking the /verify request."""
    try:
        with open(_MODEL_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


# Loaded exactly once at module import (process startup), reused for every request.
_MODEL: dict = _load_model()
_TH: dict = _MODEL.get("thresholds", {})
_CANON: frozenset = frozenset(_MODEL.get("canonical_clock", ("09:00:00", "14:30:00")))
_LABOUR_HOURS: dict = _MODEL.get("labour_hours", {})
_LABOUR_RATE: dict = _MODEL.get("labour_rate", {})
_RATE_GLOBAL: dict = _MODEL.get("labour_rate_global", {})
_ORIGIN: dict = _MODEL.get("origin", {})

# Tuned on the training corpus to maximise the NET self_test delta: high t4
# recall while keeping clean false positives ~0 (each clean FP costs ~0.35 on
# that case). Defaults match scripts/train_anomaly.py; the artifact overrides.
_LABOUR_HOURS_Z = float(_TH.get("labour_hours_z", 3.0))
_RATE_Z = float(_TH.get("rate_z", 3.0))
_RATE_GLOBAL_Z = float(_TH.get("rate_global_z", 4.0))
_ORIGIN_MAX_FREQ = float(_TH.get("origin_max_freq", 0.0))
_ORIGIN_MIN_TOTAL = int(_TH.get("origin_min_total", 12))


def _clock(ts: str) -> str:
    """Wall-clock 'HH:MM:SS' from an ISO-8601 timestamp."""
    if "T" not in ts:
        return ""
    t = ts.split("T", 1)[1]
    # strip zone designator(s): trailing Z, or +hh:mm / -hh:mm offset
    t = t.rstrip("Z")
    for sep in ("+", "-"):
        if sep in t:
            t = t.split(sep, 1)[0]
    return t


def _robust_z(value: float, group: dict) -> float | None:
    scale = group.get("scale", 0)
    if not scale:
        return None
    return (value - group["med"]) / scale


def detect(ctx: VerifyContext) -> list:
    """Flag t4 statistical outliers across the chain's attestations."""
    if not _MODEL:
        return []
    out: list = []
    for node in ctx.nodes_by_hash.values():
        att = node.attestation
        action = att.action_type
        name = att.output.product_id  # internal product_id == real output.name
        labelled = False  # at most one anomaly per node (dedup is also done downstream)

        # --- timing: off canonical wall-clock ---
        clk = _clock(att.timestamp)
        if clk and clk not in _CANON:
            out.append(anomaly("t4_timing_outlier", node.hash,
                               f"timestamp {att.timestamp} off canonical schedule"))
            labelled = True

        # --- origin: rare/never source country for this raw material ---
        if not labelled and action == "raw_material_supply":
            og = _ORIGIN.get(name)
            if og and og.get("n", 0) >= _ORIGIN_MIN_TOTAL:
                freq = og.get("freq", {}).get(att.work_country, 0.0)
                if freq <= _ORIGIN_MAX_FREQ:
                    out.append(anomaly(
                        "t4_origin_outlier", node.hash,
                        f"{name} sourced from {att.work_country} "
                        f"(genuine freq {freq:.3f})"))
                    labelled = True

        # --- labour / cost: transformation distribution tails ---
        if not labelled and action in _ST_ACTIONS and att.labour_hours > 0:
            key = f"{action}|{name}"
            lh = att.labour_hours
            rate = (att.labour_cents / 100.0) / lh  # cents -> CAD per hour

            # labour_hours outlier (hours inflated, rate plausible)
            grp = _LABOUR_HOURS.get(key)
            lz = _robust_z(lh, grp) if grp else None
            if lz is not None and lz >= _LABOUR_HOURS_Z:
                out.append(anomaly(
                    "t4_labour_outlier", node.hash,
                    f"labour_hours {lh:g} anomalous for {name} (z={lz:.1f})"))
                labelled = True

            # cost (labour rate) outlier — per-product, with global fallback
            if not labelled:
                rgrp = _LABOUR_RATE.get(key)
                if rgrp:
                    rz = _robust_z(rate, rgrp)
                    if rz is not None and rz >= _RATE_Z:
                        out.append(anomaly(
                            "t4_cost_outlier", node.hash,
                            f"labour rate {rate:.0f}/h anomalous for {name} (z={rz:.1f})"))
                        labelled = True
                elif _RATE_GLOBAL.get("scale"):
                    rz = _robust_z(rate, _RATE_GLOBAL)
                    if rz is not None and rz >= _RATE_GLOBAL_Z:
                        out.append(anomaly(
                            "t4_cost_outlier", node.hash,
                            f"labour rate {rate:.0f}/h globally anomalous (z={rz:.1f})"))
                        labelled = True
    return out
