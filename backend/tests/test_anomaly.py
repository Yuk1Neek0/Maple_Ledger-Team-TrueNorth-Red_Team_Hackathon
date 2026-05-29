"""Tests for the advisory anomaly-detection module (task A5).

Builds Node objects straight from the happy_path fixture, then asserts that an
artificially inflated-labour node is flagged while a clean run flags fewer/none.
All returned Anomaly records must be advisory and reason==ANOMALY.
"""
import json
import dataclasses
from pathlib import Path

from app.adapters import attestation_from_dict, compute_hash
from app.anomaly import score
from app.models import Node, Reason

FIX = Path(__file__).parent / "fixtures"


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def _node(att):
    """Wrap an Attestation in a Node with hash set; defaults for the rest."""
    return Node(attestation=att, hash=compute_hash(att))


def _happy_nodes():
    fx = _load("happy_path.json")
    return [_node(attestation_from_dict(obj)) for obj in fx["attestations"]]


def test_fixture_has_four_nodes():
    assert len(_happy_nodes()) == 4


def test_inflated_labour_node_is_flagged():
    nodes = _happy_nodes()

    # Clone one happy-path attestation but with grossly inflated labour (50x the
    # largest happy-path labour of 400 cents -> 20000 cents). Same quantity, so
    # labour_per_unit and the labour/materials ratio both blow up.
    base = nodes[-1].attestation  # SUP-DRONE, labour=400
    inflated_att = dataclasses.replace(base, labour_cents=base.labour_cents * 50)
    inflated_node = _node(inflated_att)

    nodes_with_outlier = nodes + [inflated_node]
    anomalies = score(nodes_with_outlier)

    flagged_hashes = {a.attestation_hash for a in anomalies}
    assert inflated_node.hash in flagged_hashes, (
        f"inflated node {inflated_node.hash} not flagged; "
        f"flagged={flagged_hashes}"
    )

    # A clean happy-path-only run should flag strictly fewer nodes than the
    # run that contains the obvious outlier (here: none).
    clean_anomalies = score(nodes)
    assert len(clean_anomalies) < len(anomalies)
    assert clean_anomalies == []


def test_all_returned_anomalies_are_advisory():
    nodes = _happy_nodes()
    base = nodes[-1].attestation
    inflated_att = dataclasses.replace(base, labour_cents=base.labour_cents * 50)
    nodes_with_outlier = nodes + [_node(inflated_att)]

    anomalies = score(nodes_with_outlier)
    assert anomalies, "expected at least one anomaly with the injected outlier"
    for a in anomalies:
        assert a.advisory is True
        assert a.reason == Reason.ANOMALY
        # detail should carry the score and the offending feature for humans.
        assert "score=" in a.detail
        assert "feature" in a.detail


def test_small_input_does_not_crash():
    nodes = _happy_nodes()
    assert score([]) == []                # no nodes
    assert score(nodes[:1]) == []         # single node -> nothing to compare
    # two nodes: z-score fallback path, must not raise
    assert isinstance(score(nodes[:2]), list)
