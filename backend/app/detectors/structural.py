"""Lane B — NEW structural detectors.

Scope (fill in here): `parent_hash_mismatch` (recompute content_hash, compare to
parents[].content_hash), `unit_mismatch` (parents[].unit vs parent output.unit),
`dangling_parent` (parents[].attestation_id absent). The cycle / mass-balance /
signature / temporal checks already live in the engine — only label-remap those.

Stub: returns no anomalies until Lane B implements it.
"""
from __future__ import annotations

from .base import VerifyContext


def detect(ctx: VerifyContext) -> list:
    return []
