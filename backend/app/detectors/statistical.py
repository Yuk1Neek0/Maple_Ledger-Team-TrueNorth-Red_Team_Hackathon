"""Lane D — statistical (t4) detectors — the leaderboard lane.

Scope (fill in here): learn the genuine-chain distribution from
provenance-kit/training_corpus.jsonl (per action_type / unit / country baselines)
and flag t4_cost / t4_timing / t4_origin / t4_labour outliers. Load any trained
artifact ONCE at import/startup (never per request). Tune for F1 on t4_perturbed
without hurting clean precision.

Stub: returns no anomalies until Lane D implements it.
"""
from __future__ import annotations

from .base import VerifyContext


def detect(ctx: VerifyContext) -> list:
    return []
