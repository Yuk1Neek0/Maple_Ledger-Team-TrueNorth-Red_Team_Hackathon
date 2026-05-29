"""Verifier orchestration + JSON serialization.

FOUNDATION STUB: `verify_root` returns a valid-shaped placeholder so the API
boots and the UIs have a live target. The real precedence engine + cost math
(A1 graph -> B1 sig/schema -> A3 precedence -> A4 mass-balance -> A2 content)
lands in the backend-core stream and replaces this body. Do not build UI logic
that depends on the stub's numbers — bind to the SHAPE only.
"""
from __future__ import annotations

from .models import Anomaly, Designation, VerificationResult


def verify_root(store: dict[str, dict], registry: dict, root_hash: str) -> VerificationResult:
    # STUB — replaced by the backend-core stream.
    return VerificationResult(
        designation=Designation.NONE,
        canadian_pct=0.0,
        total_cost_cents=0,
        canadian_cost_cents=0,
        cost_by_country={},
        anomalies=[],
    )


def anomaly_to_dict(a: Anomaly) -> dict:
    return {
        "reason": a.reason.value,
        "attestation_hash": a.attestation_hash,
        "detail": a.detail,
        "advisory": a.advisory,
    }


def result_to_dict(r: VerificationResult) -> dict:
    return {
        "designation": r.designation.value,
        "canadian_pct": r.canadian_pct,
        "total_cost_cents": r.total_cost_cents,
        "canadian_cost_cents": r.canadian_cost_cents,
        "cost_by_country": r.cost_by_country,
        "anomalies": [anomaly_to_dict(a) for a in r.anomalies],
    }
