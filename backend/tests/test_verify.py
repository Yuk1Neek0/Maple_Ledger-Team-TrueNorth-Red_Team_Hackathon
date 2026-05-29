"""Verdict + anomaly assertions across all fixtures (A2/A3/A4) + cycle guard."""
import json
from pathlib import Path

from app import adapters
from app.chain import SupplyChain, build_chain
from app.models import Attestation, Designation, InputRef, Node, Output, Reason
from app.registry import load_registry
from app.verify import Verifier, verify_root

FIX = Path(__file__).parent / "fixtures"
REGISTRY = load_registry()


def run(name):
    fx = json.loads((FIX / name).read_text(encoding="utf-8"))
    atts = [adapters.attestation_from_dict(o) for o in fx["attestations"]]
    chain = build_chain(atts, fx["root_hash"])
    return fx, Verifier(REGISTRY).verify(chain)


def reasons(result):
    return {a.reason for a in result.anomalies}


def test_happy_path():
    _, r = run("happy_path.json")
    assert r.designation == Designation.MADE_IN_CANADA
    assert r.total_cost_cents == 1470
    assert r.canadian_cost_cents == 1420
    assert r.cost_by_country == {"CA": 1420, "CN": 50}
    assert round(r.canadian_pct, 3) == 0.966
    assert not (reasons(r) & {Reason.SIGNATURE_INVALID, Reason.UNKNOWN_ISSUER,
                              Reason.BROKEN_LINK, Reason.MASS_BALANCE})


def test_product_of_canada():
    _, r = run("product_of_canada.json")
    assert r.designation == Designation.PRODUCT_OF_CANADA
    assert r.total_cost_cents == 1470 and r.canadian_cost_cents == 1470


def test_foreign_assembly_fails_on_last_st():
    _, r = run("foreign_assembly.json")
    assert r.designation == Designation.NONE  # >=98% CA cost but last ST in CN


def test_tampered_signature():
    _, r = run("tampered.json")
    assert Reason.SIGNATURE_INVALID in reasons(r)
    assert r.designation == Designation.NONE


def test_unknown_issuer():
    _, r = run("unknown_issuer.json")
    assert Reason.UNKNOWN_ISSUER in reasons(r)
    assert r.designation == Designation.NONE


def test_broken_link():
    _, r = run("broken_link.json")
    assert Reason.BROKEN_LINK in reasons(r)
    assert r.designation == Designation.NONE


def test_overdraw_mass_balance():
    _, r = run("overdraw.json")
    assert Reason.MASS_BALANCE in reasons(r)
    assert r.designation == Designation.NONE


def test_verify_root_scopes_to_reachable():
    """Regression: a shared in-memory store must not let attestations from one
    product's chain contaminate another's (e.g. a shared raw-material lot
    looking over-consumed). verify_root scopes to the queried root's subgraph."""
    store = {}
    for name in ("happy_path.json", "product_of_canada.json", "overdraw.json"):
        fx = json.loads((FIX / name).read_text(encoding="utf-8"))
        for obj in fx["attestations"]:
            store[adapters.compute_hash(adapters.attestation_from_dict(obj))] = obj
    pc = json.loads((FIX / "product_of_canada.json").read_text(encoding="utf-8"))
    r = verify_root(store, REGISTRY, pc["root_hash"])
    assert r.designation == Designation.PRODUCT_OF_CANADA
    assert Reason.MASS_BALANCE not in {a.reason for a in r.anomalies}


def test_cycle_guard():
    """Content addressing makes cycles unconstructable; the Kahn guard still
    detects one if references happen to loop. Craft it manually."""
    a = Attestation("SUP-A", Output("a", 1, "u"), (InputRef("B", 1),),
                    10, 10, "CA", True, "t", "sig")
    b = Attestation("SUP-B", Output("b", 1, "u"), (InputRef("A", 1),),
                    10, 10, "CA", False, "t", "sig")
    by_hash = {
        "A": Node(a, "A", input_hashes=["B"], consumer_hashes=["B"]),
        "B": Node(b, "B", input_hashes=["A"], consumer_hashes=["A"]),
    }
    order, has_cycle = SupplyChain(by_hash, "A").topo_walk()
    assert has_cycle and order == []
