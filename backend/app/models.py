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
    product_id: str
    quantity: int          # integer units
    unit: str


@dataclass(frozen=True)
class InputRef:
    attestation_hash: str  # content hash of the consumed attestation
    quantity_used: int     # how much of that output this node consumed


@dataclass(frozen=True)
class Attestation:
    supplier_id: str       # maps to a registry keyid
    output: Output
    inputs: tuple[InputRef, ...]
    materials_cents: int   # >= 0
    labour_cents: int      # >= 0
    work_country: str      # ISO-2, e.g. "CA","CN" — the work-location signal*
    is_substantial_transformation: bool   # spec-dependent flag*
    timestamp: str         # ISO-8601, used for ordering checks only
    signature: str         # base64 Ed25519 over canonicalize(payload)
    # payload = this object minus `signature`


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
    ANOMALY = "ANOMALY"             # advisory only, never rejects


@dataclass
class Anomaly:
    reason: Reason
    attestation_hash: str
    detail: str
    advisory: bool = False          # True only for ANOMALY


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
