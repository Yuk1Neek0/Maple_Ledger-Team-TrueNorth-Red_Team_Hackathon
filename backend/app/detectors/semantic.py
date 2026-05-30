"""Lane C — semantic detectors.

Scope (fill in here): `transformation_implausible` (e.g. a final_integration /
subassembly that consumes nothing; ST-typed node with no inputs) and
`cost_anomaly` (labour rate = labour_cost_cad / labour_hours outside a plausible
band, band calibrated from the training corpus).

Stub: returns no anomalies until Lane C implements it.
"""
from __future__ import annotations

from .base import VerifyContext


def detect(ctx: VerifyContext) -> list:
    return []
