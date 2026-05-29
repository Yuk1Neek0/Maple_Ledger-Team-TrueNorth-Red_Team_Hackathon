"""Advisory anomaly detection (task A5).

ADVISORY ONLY. This module never changes a verdict or designation; it only
emits ``Anomaly`` records with ``advisory=True`` and ``reason=Reason.ANOMALY``.
The verifier may attach these to nodes for human review, but precedence and
cost math must ignore them.

Approach: per node we derive cost-shape features (labour/qty, materials/qty,
labour/materials ratio) and fit an ``IsolationForest`` over the batch, then map
its raw scores onto a normalized 0-1 anomaly score (higher = more anomalous).

Small-input choice: IsolationForest is unreliable for very small batches, so
for n<3 nodes we fall back to a per-feature z-score (and with <2 nodes there is
nothing to compare against, so we return []).
"""
from __future__ import annotations

from collections.abc import Iterable

import numpy as np
from sklearn.ensemble import IsolationForest

from .models import Anomaly, Node, Reason

_FEATURE_NAMES = (
    "labour_per_unit",      # labour_cents / quantity
    "materials_per_unit",   # materials_cents / quantity
    "labour_materials_ratio",  # labour_cents / (materials_cents + 1)
)


def _features(node: Node) -> list[float]:
    """Derive the cost-shape feature vector for one node."""
    att = node.attestation
    qty = att.output.quantity
    qty = qty if qty > 0 else 1  # guard divide-by-zero
    labour_per_unit = att.labour_cents / qty
    materials_per_unit = att.materials_cents / qty
    labour_materials_ratio = att.labour_cents / (att.materials_cents + 1)
    return [labour_per_unit, materials_per_unit, labour_materials_ratio]


def _normalize_iforest(model: IsolationForest, matrix: np.ndarray) -> np.ndarray:
    """Map IsolationForest decision_function to a 0-1 anomaly score.

    decision_function: positive = inlier, negative = outlier. We negate so that
    higher = more anomalous, then min-max scale across the batch into [0, 1].
    """
    raw = -model.decision_function(matrix)  # higher == more anomalous
    lo, hi = float(raw.min()), float(raw.max())
    if hi - lo < 1e-12:
        return np.zeros_like(raw)  # all identical -> nothing stands out
    return (raw - lo) / (hi - lo)


def _normalize_zscore(matrix: np.ndarray) -> np.ndarray:
    """Fallback for tiny batches: per-feature z-score, aggregated by max |z|,
    then squashed into [0, 1] so it composes with the threshold the same way."""
    mean = matrix.mean(axis=0)
    std = matrix.std(axis=0)
    std = np.where(std < 1e-12, 1.0, std)
    z = np.abs((matrix - mean) / std)
    agg = z.max(axis=1)  # most-deviant feature drives the score
    hi = float(agg.max())
    if hi < 1e-12:
        return np.zeros_like(agg)
    return agg / hi


def _worst_feature(node_features: list[float], matrix: np.ndarray) -> tuple[str, float]:
    """Return (feature_name, z) for the feature that deviates most from the batch."""
    mean = matrix.mean(axis=0)
    std = matrix.std(axis=0)
    std = np.where(std < 1e-12, 1.0, std)
    z = np.abs((np.asarray(node_features) - mean) / std)
    idx = int(np.argmax(z))
    return _FEATURE_NAMES[idx], float(z[idx])


def score(nodes: Iterable[Node], threshold: float = 0.6) -> list[Anomaly]:
    """Score nodes for cost-shape anomalies. Advisory only.

    Returns one ``Anomaly`` (advisory, reason=ANOMALY) per node whose normalized
    anomaly score meets or exceeds ``threshold``.
    """
    node_list = list(nodes)
    # Need at least 2 nodes to have anything to compare against.
    if len(node_list) < 2:
        return []

    matrix = np.asarray([_features(n) for n in node_list], dtype=float)

    if len(node_list) < 3:
        # Small-batch fallback: IsolationForest is weak here, use z-score.
        # Gate = absolute deviation (|z| >= 3) so a cohesive batch flags nothing.
        scores = _normalize_zscore(matrix)
        gate = (matrix - matrix.mean(axis=0))
        std = matrix.std(axis=0)
        std = np.where(std < 1e-12, 1.0, std)
        is_outlier = (np.abs(gate / std) >= 3.0).any(axis=1)
        method = "zscore"
    else:
        model = IsolationForest(
            n_estimators=100,
            contamination="auto",
            random_state=0,
        )
        model.fit(matrix)
        scores = _normalize_iforest(model, matrix)
        # IsolationForest's own outlier decision (predict == -1) gates the
        # relative score so a clean, cohesive batch yields no flags.
        is_outlier = model.predict(matrix) == -1
        method = "isolation_forest"

    anomalies: list[Anomaly] = []
    for node, node_score, feats, outlier in zip(
        node_list, scores, matrix.tolist(), is_outlier
    ):
        if outlier and node_score >= threshold:
            feat_name, feat_z = _worst_feature(feats, matrix)
            detail = (
                f"advisory anomaly: score={node_score:.3f} "
                f"(>= threshold {threshold:.2f}, method={method}); "
                f"most-deviant feature '{feat_name}' "
                f"(z={feat_z:.2f}, value={dict(zip(_FEATURE_NAMES, feats))[feat_name]:.2f})"
            )
            anomalies.append(
                Anomaly(
                    reason=Reason.ANOMALY,
                    attestation_hash=node.hash,
                    detail=detail,
                    advisory=True,
                )
            )
    return anomalies
