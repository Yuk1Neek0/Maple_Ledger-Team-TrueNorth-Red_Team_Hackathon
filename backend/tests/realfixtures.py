"""Real-spec attestation builders for the test suite (Lane G).

The original fixtures (`backend/tests/fixtures/*.json`) were written against the
OLD MOCK wire model (`supplier_id: "SUP-ALU"`, `materials_cents`,
`inputs[].attestation_hash`, `is_substantial_transformation`). Lane 0 swapped the
implementation to the REAL spec (`costs.material_cad`/`labour_cost_cad` floats,
`performed_in_country`, `parents[].content_hash`, `action_type`,
`signature.{algorithm,value}`, ...). Feeding mock JSON to the real
`adapters.attestation_from_dict` silently yields zero costs / no parents, which is
why ~26 legacy tests started failing on pure format mismatch.

This module rebuilds the same scenarios in the REAL wire format and SIGNS each
node with the real supplier private keys from
`provenance-kit/private_keys/supplier_private_keys.json`, using
`provenance-kit/reference_lib` for byte-exact canonicalization. The signed wire
dicts can be fed straight into `verify.verify_chain(...)` exactly as the harness
would.

Everything here is deterministic: Ed25519 over the canonical bytes is
deterministic, so a fixed key + payload always yields the same signature and the
same `content_hash`. No JSON fixture files are needed — the chains are built in
code so they always match the implementation's current wire contract.

Design note (why the "clean" chains look the way they do)
---------------------------------------------------------
The backend runs statistical (t4) + semantic detectors calibrated on the real
training corpus. Two of those calibrations matter when *hand-building* chains:

  * `t4_timing_outlier` flags any wall-clock not in the canonical set
    {09:00:00, 14:30:00}. So clean nodes use `TS_RAW` / `TS_TRANSFORM*`.
  * `cost_anomaly` flags labour rates outside [20, 150] CAD/hr. So clean
    transformations use a ~60 CAD/hr rate (`labour_cost_cad = 60 * labour_hours`).

Honouring both keeps a genuinely-clean scenario `chain_valid == True` with no
anomalies, which lets the negative tests assert "no integrity anomaly fired"
rather than fighting detector false positives.
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

# Make the vendored reference_lib importable (byte-exact canon + signing).
_REPO = Path(__file__).resolve().parents[2]
_PKIT = _REPO / "provenance-kit"
if str(_PKIT) not in sys.path:
    sys.path.insert(0, str(_PKIT))

import reference_lib as rl  # noqa: E402

_PRIV_PATH = _PKIT / "private_keys" / "supplier_private_keys.json"
PRIVATE_KEYS: dict[str, str] = json.loads(
    _PRIV_PATH.read_text(encoding="utf-8")
)["keys"]

# A small stable cast of real registered suppliers, by country, for readable
# scenarios. All are present in supplier_public_keys.json + supplier_private_keys.
SUP_CA_1 = "sup-0001"
SUP_CA_2 = "sup-0003"
SUP_CA_3 = "sup-0005"
SUP_CN = "sup-0002"
SUP_US = "sup-0004"
# An id that is NOT in the registry (used for the unknown-issuer scenario). We
# still sign it with a real key so only the *registry membership* check fires.
SUP_UNKNOWN = "sup-not-registered"

# Canonical wall-clock times the genuine corpus uses (statistical.py keys timing
# off these). Using them keeps "clean" scenarios free of t4_timing_outlier
# false positives so a clean chain is genuinely chain_valid.
TS_RAW = "2026-03-06T09:00:00Z"          # raw_material_supply canonical clock
TS_TRANSFORM = "2026-03-21T14:30:00Z"    # transformation canonical clock
TS_TRANSFORM_2 = "2026-04-10T14:30:00Z"  # a later transformation (leaf)

# Mid-band labour rate (CAD/hr): clean corpus spans 40..141; 60 sits safely
# inside the [20, 150] plausibility band the cost_anomaly detector uses.
_CLEAN_RATE = 60.0


def _clean_labour(hours: float) -> float:
    """labour_cost_cad for a transformation that should not trip cost_anomaly."""
    return _CLEAN_RATE * hours


def content_hash(att: dict) -> str:
    """Byte-exact content hash of a signed (or unsigned) wire dict."""
    return rl.content_hash(att)


def build_node(
    attestation_id: str,
    supplier_id: str,
    *,
    country: str,
    action_type: str,
    material_cad: float = 0.0,
    labour_cost_cad: float = 0.0,
    labour_hours: float = 0.0,
    timestamp: str = TS_RAW,
    name: str = "part",
    quantity_produced: float = 1.0,
    unit: str = "units",
    parents: list[dict] | None = None,
    sign_with: str | None = None,
) -> dict:
    """Build one real-format attestation and sign it.

    `parents` is a list of parent refs (use `parent_ref`). `sign_with` overrides
    the signing key id (defaults to `supplier_id`); pass a real key id when the
    claimed supplier is itself unregistered so the signature is still well-formed.
    """
    att = {
        "attestation_id": attestation_id,
        "version": "1.0",
        "supplier_id": supplier_id,
        "timestamp": timestamp,
        "action_type": action_type,
        "performed_in_country": country,
        "parents": parents or [],
        "output": {
            "name": name,
            "quantity_produced": quantity_produced,
            "unit": unit,
        },
        "costs": {
            "material_cad": material_cad,
            "labour_hours": labour_hours,
            "labour_cost_cad": labour_cost_cad,
        },
    }
    key_id = sign_with or supplier_id
    return rl.sign_attestation(att, PRIVATE_KEYS[key_id])


def resign(att: dict, sign_with: str) -> dict:
    """Re-sign a wire dict after mutating its body (drops the stale signature)."""
    body = {k: v for k, v in att.items() if k != "signature"}
    return rl.sign_attestation(body, PRIVATE_KEYS[sign_with])


def parent_ref(parent: dict, quantity_consumed: float, unit: str | None = None) -> dict:
    """A `parents[]` entry pointing at an already-built parent node.

    `unit` defaults to the parent's output unit (so it matches by default). Pass
    a different unit to construct a unit_mismatch scenario.
    """
    return {
        "attestation_id": parent["attestation_id"],
        "content_hash": content_hash(parent),
        "quantity_consumed": quantity_consumed,
        "unit": unit if unit is not None else parent["output"]["unit"],
    }


def tamper_signature(att: dict) -> dict:
    """Return a copy whose signature value is corrupted (signature_invalid)."""
    out = copy.deepcopy(att)
    val = out["signature"]["value"]
    # Flip the first base64 char to something different but still valid base64.
    swap = "A" if val[0] != "A" else "B"
    out["signature"]["value"] = swap + val[1:]
    return out


def tamper_body_no_resign(att: dict) -> dict:
    """Mutate a signed field WITHOUT re-signing (tamper_no_resign / mutated
    content -> signature no longer verifies)."""
    out = copy.deepcopy(att)
    out["output"]["name"] = out["output"]["name"] + " (altered)"
    return out


# ---------------------------------------------------------------------------
# Scenario builders. Each returns (product_attestation_id, [wire dicts]).
# All "clean" scenarios use canonical timestamps + an in-band labour rate so
# they verify with chain_valid == True and zero anomalies.
# ---------------------------------------------------------------------------
def happy_path() -> tuple[str, list[dict]]:
    """alu(CA raw) + bear(CN raw) -> motor(CA mfg, ST) -> drone(CA final, ST).

    Mostly-Canadian cost with the last substantial transformation in CA ->
    made_in_canada. The CN bearing keeps it below the 98% product-of-canada bar.
    Clean: verifies with no anomalies.
    """
    alu = build_node("att-alu", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    bear = build_node("att-bear", SUP_CN, country="CN", action_type="raw_material_supply",
                      material_cad=50.00, name="bearings", unit="pcs", timestamp=TS_RAW)
    motor = build_node("att-motor", SUP_CA_2, country="CA", action_type="component_manufacture",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0, timestamp=TS_TRANSFORM,
                       name="motor_housing", unit="pcs",
                       parents=[parent_ref(alu, 1.0, "kg"), parent_ref(bear, 1.0, "pcs")])
    drone = build_node("att-drone", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(motor, 1.0, "pcs")])
    return "att-drone", [alu, bear, motor, drone]


def product_of_canada() -> tuple[str, list[dict]]:
    """All-CA chain with the last ST in CA -> 100% -> product_of_canada. Clean."""
    alu = build_node("att-alu2", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    motor = build_node("att-motor2", SUP_CA_2, country="CA", action_type="component_manufacture",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0, timestamp=TS_TRANSFORM,
                       name="motor_housing", unit="pcs", parents=[parent_ref(alu, 1.0, "kg")])
    drone = build_node("att-drone2", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(motor, 1.0, "pcs")])
    return "att-drone2", [alu, motor, drone]


def foreign_assembly() -> tuple[str, list[dict]]:
    """Almost all cost in CA upstream, but the LAST substantial transformation
    happens in a foreign country -> designation none regardless of percentage."""
    alu = build_node("att-alu3", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=1000.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    # final integration performed in CN -> last ST is foreign.
    drone = build_node("att-drone3", SUP_CN, country="CN", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(alu, 1.0, "kg")])
    return "att-drone3", [alu, drone]


def under_51_percent() -> tuple[str, list[dict]]:
    """Majority foreign cost; last ST in CA but percentage < 51 -> none. Clean."""
    foreign = build_node("att-foreign", SUP_CN, country="CN", action_type="raw_material_supply",
                         material_cad=10000.00, name="foreign_bulk", unit="kg", timestamp=TS_RAW)
    drone = build_node("att-drone4", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(foreign, 1.0, "kg")])
    return "att-drone4", [foreign, drone]


def tampered_signature() -> tuple[str, list[dict]]:
    """Happy chain but the root's signature value is corrupted -> signature_invalid."""
    root_id, chain = happy_path()
    chain = list(chain)
    chain[-1] = tamper_signature(chain[-1])
    return root_id, chain


def tamper_no_resign() -> tuple[str, list[dict]]:
    """Root body mutated after signing (no re-sign) -> signature_invalid."""
    root_id, chain = happy_path()
    chain = list(chain)
    chain[-1] = tamper_body_no_resign(chain[-1])
    return root_id, chain


def unknown_issuer() -> tuple[str, list[dict]]:
    """Root claims a supplier id absent from the registry. We still sign it with
    a real key so ONLY the unknown-issuer (registry membership) check fires."""
    alu = build_node("att-alu5", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    drone = build_node("att-drone5", SUP_UNKNOWN, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(alu, 1.0, "kg")], sign_with=SUP_CA_3)
    return "att-drone5", [alu, drone]


def broken_link() -> tuple[str, list[dict]]:
    """Root references a parent attestation_id that is NOT in the submission ->
    dangling_parent (BROKEN_LINK)."""
    alu = build_node("att-alu6", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    # Build a phantom parent to derive a content hash, then DON'T include it.
    phantom = build_node("att-phantom", SUP_CA_2, country="CA",
                         action_type="raw_material_supply", material_cad=100.0, name="ghost",
                         timestamp=TS_RAW)
    drone = build_node("att-drone6", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(alu, 1.0, "kg"), parent_ref(phantom, 1.0)])
    return "att-drone6", [alu, drone]  # phantom intentionally omitted


def parent_hash_mismatch() -> tuple[str, list[dict]]:
    """Root claims a parent content_hash that differs from the parent's actual
    hash (rewritten content) -> parent_hash_mismatch."""
    alu = build_node("att-alu12", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    ref = parent_ref(alu, 1.0, "kg")
    ref["content_hash"] = "0" * 64  # claimed hash != real; attestation_id still present
    drone = build_node("att-drone13", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs", parents=[ref])
    return "att-drone13", [alu, drone]


def unit_mismatch() -> tuple[str, list[dict]]:
    """Root consumes a parent in a unit different from the parent's output unit
    -> unit_mismatch."""
    alu = build_node("att-alu13", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    drone = build_node("att-drone14", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(alu, 1.0, "m2")])  # parent outputs kg
    return "att-drone14", [alu, drone]


def transformation_implausible() -> tuple[str, list[dict]]:
    """A final_integration that consumes nothing -> transformation_implausible."""
    drone = build_node("att-drone15", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs", parents=[])
    return "att-drone15", [drone]


def overdraw_mass_balance() -> tuple[str, list[dict]]:
    """A parent lot produces 1 unit; the child consumes 5 -> mass_balance."""
    lot = build_node("att-lot", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", quantity_produced=1.0,
                     timestamp=TS_RAW)
    drone = build_node("att-drone7", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(lot, 5.0, "kg")])
    return "att-drone7", [lot, drone]


def partial_consumption_valid() -> tuple[str, list[dict]]:
    """Producer makes 10, consumer takes 2 -> under-consumption is legitimate
    (NOT a mass-balance violation). Clean."""
    lot = build_node("att-lot2", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", quantity_produced=10.0,
                     timestamp=TS_RAW)
    drone = build_node("att-drone8", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(lot, 2.0, "kg")])
    return "att-drone8", [lot, drone]


def legitimate_repeat() -> tuple[str, list[dict]]:
    """Two DISTINCT attestations (different ids) from the same (supplier, product)
    feeding one assembler. This is legitimate (off-the-shelf parts repeat) and
    must NOT be flagged as a replay. Clean."""
    a1 = build_node("att-rep1", SUP_CA_1, country="CA", action_type="raw_material_supply",
                    material_cad=500.00, name="serial_widget", unit="pcs", timestamp=TS_RAW)
    a2 = build_node("att-rep2", SUP_CA_1, country="CA", action_type="raw_material_supply",
                    material_cad=500.00, name="serial_widget", unit="pcs", timestamp=TS_RAW)
    drone = build_node("att-drone9", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(a1, 1.0, "pcs"), parent_ref(a2, 1.0, "pcs")])
    return "att-drone9", [a1, a2, drone]


def replay_within_chain() -> tuple[str, list[dict]]:
    """The real replay attack: the SAME attestation_id appears twice in the
    submission ("duplicate attestation_id in submission"). The two raw nodes
    differ only in a non-identifying field (timestamp) so their content hashes
    differ but they share an attestation_id.

    NOTE: per spec, the expected label is `replay_within_chain` on the duplicated
    id. See `test_verify.test_replay_within_chain_is_a_known_gap` — the current
    backend (Lane G under test) does NOT yet emit this anomaly; that test
    documents the gap rather than asserting a fix."""
    a1 = build_node("att-dup", SUP_CA_1, country="CA", action_type="raw_material_supply",
                    material_cad=500.00, name="serial_widget", unit="pcs", timestamp=TS_RAW)
    # Same attestation_id, slightly different body -> distinct content hash.
    a2 = build_node("att-dup", SUP_CA_1, country="CA", action_type="raw_material_supply",
                    material_cad=501.00, name="serial_widget", unit="pcs", timestamp=TS_RAW)
    drone = build_node("att-drone-rep", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(a1, 1.0, "pcs")])
    return "att-drone-rep", [a1, a2, drone]


def temporal_inversion() -> tuple[str, list[dict]]:
    """A consumer predates its input -> timestamp_inversion (advisory).

    The parent transformation is timestamped LATER than the consuming leaf. To
    keep the parent physically plausible (it must consume something), it draws on
    a raw input. Whole chain is CA with the last ST in CA, so the verdict stays
    product_of_canada -- the inversion is advisory and must NOT move it."""
    raw = build_node("att-ti-raw", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="raw_stock", unit="kg", timestamp=TS_RAW)
    # Parent is timestamped at TS_TRANSFORM_2 (later) but consumed by a child at
    # TS_TRANSFORM (earlier) -> inversion on the child edge.
    parent = build_node("att-late-parent", SUP_CA_2, country="CA",
                        action_type="component_manufacture",
                        labour_cost_cad=_clean_labour(5.0), labour_hours=5.0, name="late_part",
                        unit="pcs", timestamp=TS_TRANSFORM_2,
                        parents=[parent_ref(raw, 1.0, "kg")])
    drone = build_node("att-drone10", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM, name="drone_X1", unit="pcs",
                       parents=[parent_ref(parent, 1.0, "pcs")])
    return "att-drone10", [raw, parent, drone]


def zero_total_cost() -> tuple[str, list[dict]]:
    """Every node has zero cost -> total 0 -> none (can't compute a percentage)."""
    raw = build_node("att-zero-raw", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=0.0, name="free_raw", unit="kg", timestamp=TS_RAW)
    drone = build_node("att-drone11", SUP_CA_3, country="CA", action_type="final_integration",
                       material_cad=0.0, labour_cost_cad=0.0, labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(raw, 1.0, "kg")])
    return "att-drone11", [raw, drone]


def deep_chain(n: int = 20) -> tuple[str, list[dict]]:
    """An n-tier linear all-CA chain. Tier 0 is a raw supply; every other tier is
    a component_manufacture (ST) consuming the prior tier; the final tier is the
    product. All CA, all clean -> product_of_canada."""
    nodes: list[dict] = []
    prev = None
    for i in range(n):
        if i == 0:
            cur = build_node(f"att-deep-{i}", SUP_CA_1, country="CA",
                             action_type="raw_material_supply", material_cad=500.00,
                             name=f"tier_{i}", unit="pcs", timestamp=TS_RAW)
        else:
            action = "final_integration" if i == n - 1 else "component_manufacture"
            cur = build_node(f"att-deep-{i}", SUP_CA_2, country="CA", action_type=action,
                             labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                             name=f"tier_{i}", unit="pcs", timestamp=TS_TRANSFORM,
                             parents=[parent_ref(prev, 1.0, "pcs")])
        nodes.append(cur)
        prev = cur
    return f"att-deep-{n - 1}", nodes


def cycle_chain() -> tuple[str, list[dict]]:
    """Two nodes whose parent references form a loop -> circular_reference.

    Content addressing normally makes cycles unconstructable, but a child can be
    handed a content_hash that points at a node which (transitively) points back.
    We build A and B, then re-point each at the other's hash and re-sign so both
    edges resolve to a present node, closing the loop."""
    a = build_node("att-cyc-a", SUP_CA_1, country="CA", action_type="component_manufacture",
                   labour_cost_cad=_clean_labour(5.0), labour_hours=5.0, name="part_a",
                   unit="pcs", timestamp=TS_TRANSFORM)
    b = build_node("att-cyc-b", SUP_CA_2, country="CA", action_type="component_manufacture",
                   labour_cost_cad=_clean_labour(5.0), labour_hours=5.0, name="part_b",
                   unit="pcs", timestamp=TS_TRANSFORM)
    # A consumes B, B consumes A.
    a_body = {k: v for k, v in a.items() if k != "signature"}
    a_body["parents"] = [parent_ref(b, 1.0, "pcs")]
    a = rl.sign_attestation(a_body, PRIVATE_KEYS[SUP_CA_1])
    b_body = {k: v for k, v in b.items() if k != "signature"}
    b_body["parents"] = [parent_ref(a, 1.0, "pcs")]
    b = rl.sign_attestation(b_body, PRIVATE_KEYS[SUP_CA_2])
    return "att-cyc-a", [a, b]


def inflated_labour_outlier() -> tuple[str, list[dict]]:
    """A valid happy chain plus one extra sibling node with grossly inflated
    labour cost (a cost_anomaly). All signatures are valid; the percentage/
    designation are unaffected by the anomaly (made_in_canada / product_of_canada
    depending on the country mix)."""
    alu = build_node("att-il-alu", SUP_CA_1, country="CA", action_type="raw_material_supply",
                     material_cad=500.00, name="aluminum", unit="kg", timestamp=TS_RAW)
    # Grossly inflated labour rate: 5000 CAD over 5 hrs == 1000 CAD/hr (cost_anomaly).
    inflated = build_node("att-il-inflated", SUP_CA_2, country="CA",
                          action_type="component_manufacture",
                          labour_cost_cad=5000.00, labour_hours=5.0, name="inflated_part",
                          unit="pcs", timestamp=TS_TRANSFORM,
                          parents=[parent_ref(alu, 1.0, "kg")])
    drone = build_node("att-il-drone", SUP_CA_3, country="CA", action_type="final_integration",
                       labour_cost_cad=_clean_labour(5.0), labour_hours=5.0,
                       timestamp=TS_TRANSFORM_2, name="drone_X1", unit="pcs",
                       parents=[parent_ref(inflated, 1.0, "pcs")])
    return "att-il-drone", [alu, inflated, drone]


def worked_example() -> tuple[str, list[dict]]:
    """The canonical worked example shipped with the kit (recovery drone)."""
    we = json.loads(
        (_PKIT / "worked-example" / "recovery_drone_chain.json").read_text(encoding="utf-8")
    )
    return we["product_attestation_id"], we["attestations"]
