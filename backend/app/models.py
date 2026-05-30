"""Internal data model — the frozen contract (build-execution-plan §3.1).

This is the keystone. Everything downstream binds to these types. The
event-day spec touches our code ONLY through adapters.py; nothing here uses a
raw spec field name. Money is integer cents everywhere above the adapter.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


# ---- immutable, signed ----
@dataclass(frozen=True)
class Output:
    product_id: str        # real: output.name (display label; not a real id)
    quantity: float        # real: output.quantity_produced (may be fractional)
    unit: str


@dataclass(frozen=True)
class InputRef:
    attestation_hash: str  # link key = parent's content_hash (real: parents[].content_hash)
    quantity_used: float   # real: parents[].quantity_consumed (may be fractional)
    unit: str = ""         # real: parents[].unit (must equal parent output.unit)
    parent_id: str = ""    # real: parents[].attestation_id (dangling/anchor checks)


@dataclass(frozen=True)
class Attestation:
    supplier_id: str       # maps to a registry keyid
    output: Output
    inputs: tuple[InputRef, ...]
    materials_cents: int   # from costs.material_cad × 100, >= 0
    labour_cents: int      # from costs.labour_cost_cad × 100, >= 0
    work_country: str      # real: performed_in_country (ISO-2) — the work-location signal
    is_substantial_transformation: bool   # DERIVED: action_type ∈ {cm,sub,fi} and labour_hours ≥ 4
    timestamp: str         # ISO-8601, used for ordering checks only
    signature: str         # real: signature.value — base64 Ed25519 over canonical(wire − signature)
    attestation_id: str = ""   # real: explicit attestation_id (id model, see 04 §2)
    version: str = "1.0"
    action_type: str = ""      # raw_material_supply | component_manufacture | subassembly | final_integration
    labour_hours: float = 0.0  # real: costs.labour_hours (drives ST; not a cost)
    # The original wire dict — hashed/verified byte-exact via reference_lib.
    # Excluded from eq/hash so Attestation stays hashable despite the dict.
    raw: dict | None = field(default=None, compare=False)


# ---- mutable verifier wrapper ----
class Status(str, Enum):
    OK = "OK"
    INVALID = "INVALID"


class Reason(str, Enum):            # precedence order top->bottom (§3.3)
    MALFORMED = "MALFORMED"
    SIGNATURE_INVALID = "SIGNATURE_INVALID"
    UNKNOWN_ISSUER = "UNKNOWN_ISSUER"
    REPLAY_DETECTED = "REPLAY_DETECTED"
    BROKEN_LINK = "BROKEN_LINK"
    CYCLE = "CYCLE"
    MASS_BALANCE = "MASS_BALANCE"   # quantity overdraw — HARD reject
    TEMPORAL_INVERSION = "TEMPORAL_INVERSION"  # input later than consumer — advisory
    ANOMALY = "ANOMALY"             # advisory only, never rejects (IsolationForest)
    # P5 rule-based advisories (all advisory=True, never affect verdict).
    ZERO_LABOUR_ON_ST = "ZERO_LABOUR_ON_ST"        # ST claimed but no labour cost
    HIGH_FOREIGN_DEPENDENCY = "HIGH_FOREIGN_DEPENDENCY"  # >=40% foreign cost on a passing verdict
    SUSPICIOUS_COST_SPIKE = "SUSPICIOUS_COST_SPIKE"  # >=5x median of sibling inputs
    LOW_CANADIAN_WITH_CLAIM = "LOW_CANADIAN_WITH_CLAIM"  # ST=true but work_country != CA
    LABOUR_COST_OUTLIER = "LABOUR_COST_OUTLIER"    # |z-score| of labour_per_unit >= 3
    TIMESTAMP_BURST = "TIMESTAMP_BURST"            # >3 atts from same supplier within 60s


@dataclass
class Anomaly:
    reason: Reason
    attestation_hash: str
    detail: str
    advisory: bool = False          # True = heuristic; excluded from scored /verify output
    type_label: str | None = None   # detector override for the spec free-form `type` string


@dataclass
class Node:
    attestation: Attestation
    hash: str
    input_hashes: list[str] = field(default_factory=list)
    consumer_hashes: list[str] = field(default_factory=list)
    sig_valid: bool = False
    signer_known: bool = False
    status: Status = Status.OK
    reason: Reason | None = None
    subtree_percent: float = 0.0    # display-only: CA% over this node's reachable subtree
    contribution_cents: int = 0     # display-only: flow-weighted cents this node adds to the total
    annotations: dict = field(default_factory=dict)  # overlay layer; never read in the verdict path
    anomalies: list[Anomaly] = field(default_factory=list)


class Designation(str, Enum):
    PRODUCT_OF_CANADA = "PRODUCT_OF_CANADA"
    MADE_IN_CANADA = "MADE_IN_CANADA"
    NONE = "NONE"


@dataclass
class VerificationResult:
    designation: Designation
    canadian_pct: float            # display only; derived from cents
    total_cost_cents: int
    canadian_cost_cents: int
    cost_by_country: dict[str, int]
    anomalies: list[Anomaly]
    graph: dict | None = None      # {nodes,edges} topology for the UI; never feeds the verdict
