"""Tests for the advisory anomaly-detection module (task A5), real-format nodes.

Builds Node objects from the real-format happy_path chain (via
`tests.realfixtures`), then asserts that an artificially inflated-labour node is
flagged while a clean run flags none. All returned Anomaly records must be
advisory and reason==ANOMALY. The detector itself is format-agnostic — it reads
the internal `Attestation` cost fields — so only the fixture construction changed.
"""
import dataclasses

from app.adapters import attestation_from_dict, compute_hash
from app.anomaly import score
from app.models import Node, Reason
from tests import realfixtures as rf


def _node(att):
    return Node(attestation=att, hash=compute_hash(att))


def _happy_nodes():
    """A cohesive batch of similarly-shaped real-format nodes. Uniform cost shape
    so the advisory scorer (IsolationForest / z-score) flags nothing — the
    baseline against which an injected outlier must stand out."""
    nodes = []
    for i in range(4):
        att = rf.build_node(
            f"att-uniform-{i}", rf.SUP_CA_1, country="CA",
            action_type="component_manufacture", material_cad=100.0,
            labour_cost_cad=rf._clean_labour(5.0), labour_hours=5.0,
            name=f"part_{i}", unit="pcs", timestamp=rf.TS_TRANSFORM,
        )
        nodes.append(_node(attestation_from_dict(att)))
    return nodes


def test_fixture_has_four_nodes():
    assert len(_happy_nodes()) == 4


def test_inflated_labour_node_is_flagged():
    nodes = _happy_nodes()
    # Clone one happy node but with grossly inflated labour (50x), so its
    # labour_per_unit and labour/materials ratio both blow up.
    base = nodes[-1].attestation  # the drone leaf
    inflated_att = dataclasses.replace(base, labour_cents=base.labour_cents * 50 + 5000)
    inflated_node = _node(inflated_att)

    nodes_with_outlier = nodes + [inflated_node]
    anomalies = score(nodes_with_outlier)

    flagged_hashes = {a.attestation_hash for a in anomalies}
    assert inflated_node.hash in flagged_hashes, (
        f"inflated node {inflated_node.hash} not flagged; flagged={flagged_hashes}"
    )

    # A clean happy-path-only run should flag strictly fewer nodes (here: none).
    clean_anomalies = score(nodes)
    assert len(clean_anomalies) < len(anomalies)
    assert clean_anomalies == []


def test_all_returned_anomalies_are_advisory():
    nodes = _happy_nodes()
    base = nodes[-1].attestation
    inflated_att = dataclasses.replace(base, labour_cents=base.labour_cents * 50 + 5000)
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
    assert isinstance(score(nodes[:2]), list)  # two nodes: z-score fallback path
