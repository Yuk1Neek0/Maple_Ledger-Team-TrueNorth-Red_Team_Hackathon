"""Lane E — anchor-registry detectors (optional / lower priority).

Scope (fill in here): using ctx.anchor_index (loaded from
provenance-kit/registry/anchor_registry.json), flag `anchor_mismatch` (an
anchored attestation_id whose recomputed content_hash differs) and
`replay_cross_chain` (an anchored attestation appearing under a different
product_id). Absence from the registry is NOT a violation (04 §6).

Stub: returns no anomalies until Lane E implements it.
"""
from __future__ import annotations

from .base import VerifyContext


def detect(ctx: VerifyContext) -> list:
    return []
