"""Detector plugin contract (05 §1.2).

Detectors are **pure and additive**: they read the VerifyContext and return extra
Anomaly objects. They must NOT mutate other lanes' state, must emit snake_case
`type` labels via the Anomaly.reason/detail, and must be **conservative** — the
harness scores anomalies by F1, so flagging a clean node costs precision.

Each lane (B/C/D/E) owns exactly one module (`structural`, `semantic`,
`statistical`, `anchor`) and fills in its `detect(ctx)`; the REGISTRY in
`__init__.py` wires them together. Anomalies reference a node's content hash
(`attestation_hash`); the response mapper translates hash → attestation_id.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from ..models import Anomaly, Node, Reason


def anomaly(type_label: str, attestation_hash: str, detail: str = "") -> Anomaly:
    """Build a SCORED anomaly with a free-form spec `type` label (05 §1.2).

    `attestation_hash` is the offending node's content hash; the response mapper
    translates it to the attestation_id. Use the exact corpus label string
    (e.g. "transformation_implausible", "unit_mismatch", "t4_cost_outlier")."""
    return Anomaly(reason=Reason.ANOMALY, attestation_hash=attestation_hash,
                   detail=detail, advisory=False, type_label=type_label)


@dataclass
class VerifyContext:
    nodes_by_hash: dict[str, Node]        # content_hash -> Node
    nodes_by_att_id: dict[str, Node]      # attestation_id -> Node (present nodes)
    raw_by_att_id: dict[str, dict]        # attestation_id -> original wire dict
    root_hash: str                        # content hash of the product leaf
    product_attestation_id: str
    registry: dict                        # {supplier_id: {"public_key": b64, "verified": bool}}
    anchor_index: dict = field(default_factory=dict)  # {attestation_id: (content_hash, product_id)}


Detector = Callable[[VerifyContext], "list[Anomaly]"]
