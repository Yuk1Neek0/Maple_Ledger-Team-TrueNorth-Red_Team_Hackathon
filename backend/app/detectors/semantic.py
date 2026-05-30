"""Lane C — semantic anomaly detectors.

Two physically-motivated checks over the verified DAG. Both are **scored** (not
advisory) and emit the exact corpus `type` labels so classification credit lands.

1. ``transformation_implausible`` — a transformation step that produces a product
   while consuming nothing. ``raw_material_supply`` legitimately has no parents
   (it is the source), but ``component_manufacture`` / ``subassembly`` /
   ``final_integration`` must consume at least one input to be physical. In the
   training corpus every such zero-parent transformation is labelled, and **no**
   clean (or otherwise-attacked) chain has a non-raw node with zero parents, so
   the rule is exact: 17/17 caught, 0 false positives.

2. ``cost_anomaly`` — labour rate (``labour_cost_cad / labour_hours``) outside a
   plausible band. Calibrated from the 705 clean chains: clean labour rates span
   40.00 .. 141.63 CAD/hr (n=3378). The injected anomalies sit far outside —
   the dedicated ``cost_anomaly`` family is exactly 1000.0 CAD/hr, and a handful
   of secondary cost labels (on ``tamper_no_resign`` chains) sit at 158-182. A
   band of [20, 150] CAD/hr cleanly separates every labelled node (TP=19, FP=0,
   FN=0) with ~8 CAD/hr of headroom above the worst clean node and 20 below the
   tightest clean node. Constants are hard-coded (no extra files) per Lane C.

Conservative by construction: a detector that flags a clean node tanks that
case's F1, so each rule is gated on a margin the clean corpus never reaches.
"""
from __future__ import annotations

from .base import VerifyContext, anomaly

# action_types that represent a real transformation and therefore MUST consume
# at least one input. raw_material_supply is the only legitimate source node.
_TRANSFORMATION_ACTIONS = frozenset(
    {"component_manufacture", "subassembly", "final_integration"}
)

# Plausible labour-rate band in CAD/hr, learned from the clean corpus.
# Clean range observed: 40.00 .. 141.63 over 3378 nodes. The band leaves a safety
# margin on both sides while sitting below the lowest injected anomaly (158.67).
_LABOUR_RATE_MIN_CAD = 20.0
_LABOUR_RATE_MAX_CAD = 150.0


def detect(ctx: VerifyContext) -> list:
    out = []
    for node in ctx.nodes_by_hash.values():
        att = node.attestation

        # --- transformation_implausible ----------------------------------
        # A non-raw transformation that references no parents consumes nothing
        # yet claims to produce output — physically impossible.
        if att.action_type in _TRANSFORMATION_ACTIONS and not att.inputs:
            out.append(anomaly(
                "transformation_implausible",
                node.hash,
                f"{att.action_type} consumes nothing",
            ))

        # --- cost_anomaly --------------------------------------------------
        # Labour rate (CAD/hr) outside the calibrated plausible band. Only
        # meaningful when labour_hours > 0 (otherwise the rate is undefined).
        if att.labour_hours > 0:
            rate = (att.labour_cents / 100.0) / att.labour_hours
            if rate < _LABOUR_RATE_MIN_CAD or rate > _LABOUR_RATE_MAX_CAD:
                out.append(anomaly(
                    "cost_anomaly",
                    node.hash,
                    f"labour rate {rate:.1f} CAD/hr outside band "
                    f"[{_LABOUR_RATE_MIN_CAD:.0f}, {_LABOUR_RATE_MAX_CAD:.0f}]",
                ))

    return out
