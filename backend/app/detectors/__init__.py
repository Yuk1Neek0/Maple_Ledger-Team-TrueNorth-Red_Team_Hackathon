"""Detector registry + runner (05 §1.2/§1.3).

Lane 0 wires the four lane modules here as stubs. Each lane fills in its own
module's `detect(ctx)` independently — adding logic never touches this file.
"""
from __future__ import annotations

from . import anchor, semantic, statistical, structural
from .base import Detector, VerifyContext

# Order is irrelevant — detectors are additive and independent.
REGISTRY: list[Detector] = [
    structural.detect,   # Lane B
    semantic.detect,     # Lane C
    statistical.detect,  # Lane D
    anchor.detect,       # Lane E
]


def run_detectors(ctx: VerifyContext) -> list:
    """Fold every registered detector's anomalies together. One detector raising
    must never sink the others (or the whole /verify response)."""
    out: list = []
    for d in REGISTRY:
        try:
            out.extend(d(ctx) or [])
        except Exception:
            continue
    return out


__all__ = ["REGISTRY", "VerifyContext", "Detector", "run_detectors"]
