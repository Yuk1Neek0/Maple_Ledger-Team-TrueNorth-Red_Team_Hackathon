"""Generate the mock registry + signed fixture chains (build-execution-plan S2).

Run:  python data/tools/gen_mock.py
Writes data/registry.json and backend/tests/fixtures/*.json.

Every fixture is { description, root_hash, expected, attestations[] } where each
attestation is the full wire dict (payload + base64 Ed25519 signature). The
signer reuses adapters.payload_dict/canonicalize so verifier and signer agree
byte-for-byte on what gets signed.
"""
from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402

from app import adapters  # noqa: E402
from app.models import Attestation, InputRef, Output  # noqa: E402

FIXTURES = ROOT / "backend" / "tests" / "fixtures"
REGISTRY = ROOT / "data" / "registry.json"
DEV_KEYS = ROOT / "data" / "dev" / "dev_keys.json"


def _seed(supplier_id: str) -> bytes:
    """Deterministic 32-byte Ed25519 seed for a mock supplier (DEV ONLY).

    Derived from the supplier id so registry.json + fixture signatures are
    stable across reruns, and so the supplier UI can load a registered identity
    for demos. NOT for production — real signers hold their own private keys.
    """
    return hashlib.sha256(b"maple-ledger-mock-v1::" + supplier_id.encode()).digest()

SUPPLIERS = ["SUP-ALU", "SUP-BEAR", "SUP-MOTOR", "SUP-DRONE"]
TS = {"SUP-ALU": "2026-05-01T08:00:00Z", "SUP-BEAR": "2026-05-01T08:00:00Z",
      "SUP-MOTOR": "2026-05-02T08:00:00Z", "SUP-DRONE": "2026-05-03T08:00:00Z"}


def make(priv, supplier_id, product_id, qty, unit, mat, lab, country, st, inputs=(), ts=None):
    att = Attestation(
        supplier_id=supplier_id,
        output=Output(product_id, qty, unit),
        inputs=tuple(InputRef(h, q) for h, q in inputs),
        materials_cents=mat, labour_cents=lab, work_country=country,
        is_substantial_transformation=st,
        timestamp=ts or TS.get(supplier_id, "2026-05-03T08:00:00Z"),
        signature="",
    )
    payload = adapters.payload_dict(att)
    sig = base64.b64encode(priv.sign(adapters.canonicalize(payload))).decode()
    return {**payload, "signature": sig}, adapters.compute_hash(att)


def rehash(full_dict):
    """Recompute the content hash of an already-built wire dict (signature excluded)."""
    payload = {k: v for k, v in full_dict.items() if k != "signature"}
    import hashlib
    return hashlib.sha256(adapters.canonicalize(payload)).hexdigest()


def main():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)

    keys = {s: Ed25519PrivateKey.from_private_bytes(_seed(s)) for s in SUPPLIERS}
    rogue = Ed25519PrivateKey.from_private_bytes(_seed("SUP-ROGUE"))  # NOT in registry

    registry = {
        s: {
            "public_key": k.public_key().public_bytes_raw().hex(),
            "verified": True,
        }
        for s, k in keys.items()
    }
    REGISTRY.write_text(json.dumps(registry, indent=2), encoding="utf-8")

    # Dev-only: export the private seeds so the supplier UI can sign as a
    # registered identity. The real registry holds PUBLIC keys only; never ship
    # this file (gitignored via data/dev/).
    DEV_KEYS.parent.mkdir(parents=True, exist_ok=True)
    DEV_KEYS.write_text(
        json.dumps({s: _seed(s).hex() for s in SUPPLIERS}, indent=2),
        encoding="utf-8",
    )

    def write(name, description, root_hash, expected, atts):
        FIXTURES.joinpath(name).write_text(
            json.dumps(
                {"description": description, "root_hash": root_hash,
                 "expected": expected, "attestations": atts},
                indent=2,
            ),
            encoding="utf-8",
        )

    # ---- happy path: 4-node drone chain (build-execution-plan §4.3) ----
    alu, h_alu = make(keys["SUP-ALU"], "SUP-ALU", "raw_aluminum", 1, "kg", 500, 200, "CA", False)
    bear, h_bear = make(keys["SUP-BEAR"], "SUP-BEAR", "steel_bearings", 1, "pcs", 40, 10, "CN", False)
    motor, h_motor = make(keys["SUP-MOTOR"], "SUP-MOTOR", "motor_housing", 1, "pcs", 0, 300, "CA", True,
                          inputs=[(h_alu, 1), (h_bear, 1)])
    drone, h_drone = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                          inputs=[(h_motor, 1)])
    write("happy_path.json", "4-node drone chain", h_drone,
          {"designation": "MADE_IN_CANADA", "total_cost_cents": 1470, "canadian_cost_cents": 1420},
          [alu, bear, motor, drone])

    # ---- tampered: edit root field after signing -> SIGNATURE_INVALID ----
    drone_t = {**drone, "materials_cents": 99999}
    write("tampered.json", "root field edited after signing", rehash(drone_t),
          {"reason": "SIGNATURE_INVALID"}, [alu, bear, motor, drone_t])

    # ---- unknown_issuer: root signed by a key absent from the registry ----
    drone_r, h_drone_r = make(rogue, "SUP-ROGUE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                              inputs=[(h_motor, 1)])
    write("unknown_issuer.json", "root signed by unregistered key", h_drone_r,
          {"reason": "UNKNOWN_ISSUER"}, [alu, bear, motor, drone_r])

    # ---- broken_link: root references a non-existent input hash ----
    fake = "de" * 32
    drone_b, h_drone_b = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                              inputs=[(fake, 1)])
    write("broken_link.json", "root references missing input", h_drone_b,
          {"reason": "BROKEN_LINK"}, [alu, bear, motor, drone_b])

    # ---- overdraw: motor consumes 5 bearings, only 1 produced -> MASS_BALANCE ----
    motor_o, h_motor_o = make(keys["SUP-MOTOR"], "SUP-MOTOR", "motor_housing", 1, "pcs", 0, 300, "CA", True,
                              inputs=[(h_alu, 1), (h_bear, 5)])
    drone_o, h_drone_o = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                              inputs=[(h_motor_o, 1)])
    write("overdraw.json", "consumes more bearings than produced", h_drone_o,
          {"reason": "MASS_BALANCE"}, [alu, bear, motor_o, drone_o])

    # ---- product_of_canada: all-CA chain (>=98%) ----
    bear_ca, h_bear_ca = make(keys["SUP-BEAR"], "SUP-BEAR", "steel_bearings", 1, "pcs", 40, 10, "CA", False)
    motor_ca, h_motor_ca = make(keys["SUP-MOTOR"], "SUP-MOTOR", "motor_housing", 1, "pcs", 0, 300, "CA", True,
                                inputs=[(h_alu, 1), (h_bear_ca, 1)])
    drone_ca, h_drone_ca = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                                inputs=[(h_motor_ca, 1)])
    write("product_of_canada.json", "all-CA chain >=98%", h_drone_ca,
          {"designation": "PRODUCT_OF_CANADA", "total_cost_cents": 1470, "canadian_cost_cents": 1470},
          [alu, bear_ca, motor_ca, drone_ca])

    # ---- foreign_assembly: >=98% CA cost but last ST in CN -> NONE ----
    drone_f, h_drone_f = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 0, 10, "CN", True,
                              inputs=[(h_motor_ca, 1)])
    write("foreign_assembly.json", ">=98% CA cost, last ST in CN", h_drone_f,
          {"designation": "NONE"}, [alu, bear_ca, motor_ca, drone_f])

    # ---- replay: two ALU attestations sharing (SUP-ALU, raw_aluminum) -> REPLAY_DETECTED ----
    # alu_dup differs only in materials_cents (501 vs 500) so it hashes differently
    # but collides on the (issuer, output serial) pair the replay check keys on.
    alu_dup, h_alu_dup = make(keys["SUP-ALU"], "SUP-ALU", "raw_aluminum", 1, "kg", 501, 200, "CA", False)
    motor_rp, h_motor_rp = make(keys["SUP-MOTOR"], "SUP-MOTOR", "motor_housing", 1, "pcs", 0, 300, "CA", True,
                               inputs=[(h_alu, 1), (h_alu_dup, 1)])
    drone_rp, h_drone_rp = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                               inputs=[(h_motor_rp, 1)])
    write("replay.json", "two attestations share (issuer, output serial)", h_drone_rp,
          {"reason": "REPLAY_DETECTED"}, [alu, alu_dup, motor_rp, drone_rp])

    # ---- temporal: an input dated AFTER its consumer -> TEMPORAL_INVERSION (advisory) ----
    alu_late, h_alu_late = make(keys["SUP-ALU"], "SUP-ALU", "raw_aluminum", 1, "kg", 500, 200, "CA", False,
                               ts="2026-05-10T08:00:00Z")
    motor_e, h_motor_e = make(keys["SUP-MOTOR"], "SUP-MOTOR", "motor_housing", 1, "pcs", 0, 300, "CA", True,
                             inputs=[(h_alu_late, 1)], ts="2026-05-02T08:00:00Z")
    drone_e, h_drone_e = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                             inputs=[(h_motor_e, 1)], ts="2026-05-03T08:00:00Z")
    write("temporal.json", "input timestamp later than its consumer", h_drone_e,
          {"reason": "TEMPORAL_INVERSION"}, [alu_late, motor_e, drone_e])

    # ---- duplicate input ref: a node references the same input hash twice -> BROKEN_LINK ----
    # alu2x produces 2 units so the double-reference does not also trip mass-balance.
    alu2x, h_alu2x = make(keys["SUP-ALU"], "SUP-ALU", "raw_aluminum", 2, "kg", 500, 200, "CA", False)
    motor_di, h_motor_di = make(keys["SUP-MOTOR"], "SUP-MOTOR", "motor_housing", 1, "pcs", 0, 300, "CA", True,
                               inputs=[(h_alu2x, 1), (h_alu2x, 1)])
    drone_di, h_drone_di = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                               inputs=[(h_motor_di, 1)])
    write("duplicate_input.json", "node references the same input hash twice", h_drone_di,
          {"reason": "BROKEN_LINK"}, [alu2x, motor_di, drone_di])

    # ---- anomaly: a valid-signature node with ~5x labour cost -> high advisory score ----
    # Cryptography passes (the signature is real); the IsolationForest flags it for
    # human review. The verdict is unaffected — "crypto for integrity, AI for plausibility".
    motor_inf, h_motor_inf = make(keys["SUP-MOTOR"], "SUP-MOTOR", "motor_housing", 1, "pcs", 0, 1500, "CA", True,
                                 inputs=[(h_alu, 1), (h_bear, 1)])
    drone_inf, h_drone_inf = make(keys["SUP-DRONE"], "SUP-DRONE", "drone_X1", 1, "pcs", 20, 400, "CA", True,
                                 inputs=[(h_motor_inf, 1)])
    write("anomaly.json", "valid signature but inflated (~5x) labour cost", h_drone_inf,
          {"reason": "ANOMALY"}, [alu, bear, motor_inf, drone_inf])

    print(f"wrote registry ({len(registry)} suppliers) + dev_keys + 11 fixtures to {FIXTURES}")


if __name__ == "__main__":
    main()
