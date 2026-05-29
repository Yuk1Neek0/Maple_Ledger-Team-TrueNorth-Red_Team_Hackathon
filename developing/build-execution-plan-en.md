# Build Execution Plan — for an AI coding agent

> An executable, task-by-task breakdown derived from `dev-milestones.md` and `pre-event-checklist-en.md`, with the contracts from `DESIGN.md` made concrete. Written so Claude Code can implement it end-to-end **before 30 May, against mock data**, then swap in the real spec on the day.
>
> Read this top to bottom once before writing code. Build in the **execution order** in §9. Every task has a **Done-when** — do not mark it complete until that passes.

---

## 0. Prime directives (do not violate)

> **Scope of these rules:** every *always / never* below binds only *inside* the adapter boundary — our internal model, our math, our invariants. The event-day spec defines all *external* formats (schema field names & types, the cost-field format, canonical serialization, hash construction, registry shape, the substantial-transformation rule); those are unknown until kickoff, confirmed then, and isolated in `adapters.py`. The one external given is Ed25519 — the primer confirms the reference library uses it.

1. **No AI in the verdict path.** Nothing in `content.py`, `verify.py`, `chain.py`, `massbalance.py` may call an LLM or an ML model. The legal verdict is pure, reproducible arithmetic. AI is allowed only in `anomaly.py` (advisory) and the optional authoring/NL features — and even there it never sets `designation`, `canadian_pct`, or any `reason`.
2. **Internal money is integer cents — always, *after* the adapter.** The incoming cost format is unknown until the spec drops (decimal dollars, cents, or a structured field); `get_costs` is the **single** place that converts it. Above that boundary, all cost math is `int` cents only — no floats, percentages via integer cross-multiplication, a fraction only for display. *Assumes single-currency, ≤cent precision — confirm at kickoff.*
3. **Build behind the adapter boundary.** The six functions in `adapters.py` are the *only* place the event-day spec touches our code. Everything else consumes our internal model. Never let a raw spec field name leak above the boundary.
4. **The internal model is the contract.** Implement §3 exactly. If a type changes, every lane downstream changes — so freeze it first.
5. **Two conditions for a positive verdict**, always: cost threshold **AND** last substantial transformation in Canada. Never decide on percentage alone.
6. **Verify before claiming done.** Each task ships with a test. Run it.

Source-of-truth docs: `cryptographic-provenance-technical-primer_1.md` (the rules), `DESIGN.md` (the model), `dev-milestones.md` (priorities), `pre-event-checklist-en.md` (the lanes).

---

## 1. Stack & repo layout

**Stack (frozen):** Python 3.11 + FastAPI + SQLite, `pyca/cryptography` (Ed25519), `jsonschema`, `scikit-learn` (anomaly). Frontend: React + Vite + Tailwind + Cytoscape.js. Claude API for the optional P3 features only. One `docker-compose.yml`.

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + routes (§5 API)
│   │   ├── models.py        # internal data model (§3.1) — code first
│   │   ├── adapters.py      # the 6 seams (§3.2) — mock impls now
│   │   ├── registry.py      # load registry.json → {keyid: (pubkey, verified)}
│   │   ├── chain.py         # SupplyChain: build graph, topo walk, cycle guard
│   │   ├── verify.py        # Verifier: precedence engine + reason codes (§3.3)
│   │   ├── content.py       # Canadian-content math + verdict (§4 / M2.3)
│   │   ├── massbalance.py   # quantity accounting (M3.2)
│   │   └── anomaly.py       # advisory ML score (M3.3) — never touches verdict
│   ├── tests/
│   │   ├── fixtures/        # mock chains as JSON (§3.4)
│   │   └── test_*.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── supplier/            # M4.1
│   └── purchaser/           # M4.2
├── schema/
│   └── attestation.schema.json   # OUR mock schema (swapped on the day)
├── data/
│   ├── registry.json             # OUR mock registry (swapped on the day)
│   └── tools/gen_mock.py         # generates + signs mock chains
└── docker-compose.yml
```

---

## 2. Phase 0 — Setup tasks (M0 · all pre-event)

- **S1 — Environment + skeleton** `(M0.1)` · Files: repo tree above, `requirements.txt`, `docker-compose.yml`, `backend/Dockerfile`, `backend/app/main.py` with a `/health` route returning `{"status":"ok"}`. **Done when:** `docker compose up` serves `GET /health` → 200.
- **S2 — Mock key + signing tooling** `(M0.5)` · File: `data/tools/gen_mock.py`. Generate one Ed25519 keypair per mock supplier, write public keys to `data/registry.json`, and emit signed mock chains to `backend/tests/fixtures/`. **Done when:** running it produces a valid signed happy-path chain on disk.
- **S3 — Internal model** `(M0.3)` · Implement §3.1 in `models.py`. **Done when:** types import cleanly and a fixture JSON round-trips into `Attestation` objects.
- **S4 — Adapter stubs** `(M0.2)` · Implement §3.2 mock bodies in `adapters.py`. **Done when:** all six callable, returning real values off the mock data.

> S3 is the keystone. Do it before any Lane-A task.

---

## 3. The contracts (implement these exactly, first)

### 3.1 Internal data model (`models.py`)

```python
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
    OK = "OK"; INVALID = "INVALID"

@dataclass
class Node:
    attestation: Attestation
    hash: str
    input_hashes: list[str] = field(default_factory=list)
    consumer_hashes: list[str] = field(default_factory=list)
    sig_valid: bool = False
    signer_known: bool = False
    status: Status = Status.OK
    anomalies: list["Anomaly"] = field(default_factory=list)

class Reason(str, Enum):           # precedence order top→bottom (§3.3)
    MALFORMED = "MALFORMED"
    SIGNATURE_INVALID = "SIGNATURE_INVALID"
    UNKNOWN_ISSUER = "UNKNOWN_ISSUER"
    REPLAY_DETECTED = "REPLAY_DETECTED"
    BROKEN_LINK = "BROKEN_LINK"
    CYCLE = "CYCLE"
    MASS_BALANCE = "MASS_BALANCE"  # quantity overdraw — HARD reject (decision below)
    ANOMALY = "ANOMALY"            # advisory only, never rejects

@dataclass
class Anomaly:
    reason: Reason
    attestation_hash: str
    detail: str
    advisory: bool = False         # True only for ANOMALY

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
```

> `*` **Spec-dependent fields** (`work_country`, `is_substantial_transformation`): the real signal may be a `performedInCanada` boolean, a `location` object, or an `activity` enum. We code against `work_country` + the flag now; the adapter maps reality onto them on the day. **Confirm at kickoff.**
>
> **DECISION REQUIRED before building M3.2:** is a quantity overdraw a **hard reject** (`dev-milestones` M3.2) or an **advisory flag** (`DESIGN §7`)? This plan assumes **hard reject** (`MASS_BALANCE` excludes the node and forces `NONE` for any path through it). Change here if the team decides otherwise.

### 3.2 The six adapter seams (`adapters.py`) — mock bodies now, swap on the day

```python
def validate(obj: dict) -> tuple[bool, str | None]:
    """JSON-Schema check against schema/attestation.schema.json. (False, 'MALFORMED') on failure."""

def canonicalize(obj: dict) -> bytes:
    """Deterministic bytes of the payload (signature removed). MOCK: RFC-8785-style sorted-key JSON.
       SWAP on the day: DSSE/PAE if the reference library uses it."""

def verify(message: bytes, signature_b64: str, public_key) -> bool:
    """Ed25519 verify via pyca/cryptography. SWAP on the day: call the provided reference library."""

def resolve_key(supplier_id: str):
    """Registry lookup → (public_key, verified: bool). SWAP on the day: real registry format."""

def get_costs(att: Attestation) -> tuple[int, int, str]:
    """(materials_cents, labour_cents, work_country). MOCK: read fields directly.
       SWAP on the day: real cost fields + the cost-flow/partial-consumption rule."""

def find_last_st(chain) -> "Node | None":
    """The node of the last substantial transformation. MOCK: the root if its flag is set,
       else nearest-to-root flagged node. SWAP on the day: the spec's ST identification rule."""
```

### 3.3 Precedence engine (`verify.py`)

A node is evaluated against checks in this fixed order; it fails on the **first** match:

```
MALFORMED → SIGNATURE_INVALID → UNKNOWN_ISSUER → REPLAY_DETECTED → BROKEN_LINK / CYCLE → MASS_BALANCE
```

`UNKNOWN_ISSUER` = supplier not in registry, OR `verified == False`, OR the registry key does **not** verify the signature (both parts required). A failed node gets `status = INVALID` and is **excluded from the cost sum**; `CYCLE` is fatal for the whole chain (return `NONE`). `ANOMALY` is appended advisory and changes nothing.

### 3.4 Mock fixtures (`backend/tests/fixtures/`) — generate via S2

1. `happy_path.json` — the 4-node drone chain in §4.3 (expected: `MADE_IN_CANADA`, 96%).
2. `tampered.json` — happy path with one field edited after signing → `SIGNATURE_INVALID`.
3. `unknown_issuer.json` — a node signed by a key absent from the registry → `UNKNOWN_ISSUER`.
4. `broken_link.json` — an `InputRef` pointing at a missing hash → `BROKEN_LINK`.
5. `cycle.json` — A consumes B, B consumes A → `CYCLE` (chain fatal).
6. `overdraw.json` — consumes more than upstream produced → `MASS_BALANCE`.
7. `product_of_canada.json` — all-CA chain ≥98% → `PRODUCT_OF_CANADA`.
8. `foreign_assembly.json` — ≥98% CA cost but last ST in CN → `NONE` (proves the two-condition rule).

---

## 4. Canadian-content math (`content.py` · M2.3 · the hardest, highest-scored)

### 4.1 The cost-attribution rule (DEFAULT — confirm against spec on the day)

It's a DAG with sharing, so attribute by **consumption fraction**, memoized:

- For node `N` producing `Q_N` units, `own_cost(N) = materials_cents + labour_cents`.
- For edge `N → C` where `C` consumed `q` of `N`: `frac(N→C) = q / Q_N`.
- `flow(root) = 1`. For any other node: `flow(N) = Σ over consumers C of [ frac(N→C) × flow(C) ]`.
- `total_cost_cents = Σ_N round(own_cost(N) × flow(N))`.
- `canadian_cost_cents = Σ_N where work_country == "CA" of round(own_cost(N) × flow(N))`.
- Do the multiply in integers; round once per node, deterministically.

> This weighting (partial consumption across tiers) is the **#1 silent-bug zone**. Keep it in one function `attribute_costs(chain) -> dict[country,int]`, unit-test it hard, and **re-confirm the rule against the real spec at kickoff.** If the spec says full-cost-once (no weighting), it's a one-line change here.

### 4.2 Verdict (both conditions)

```
pct_num = canadian_cost_cents * 100      # integer
last_st_in_ca = (find_last_st(chain).attestation.work_country == "CA")

if not last_st_in_ca:                      designation = NONE
elif pct_num >= 98 * total_cost_cents:     designation = PRODUCT_OF_CANADA
elif pct_num >= 51 * total_cost_cents:     designation = MADE_IN_CANADA
else:                                      designation = NONE
canadian_pct = canadian_cost_cents / total_cost_cents   # display only
```

Compare with cross-multiplication (`canadian*100 >= 98*total`) — never divide-then-compare.

### 4.3 Worked example (assert against this)

4-node chain, full consumption (all `frac = 1`, so `flow = 1` everywhere):

| node | work_country | mat | lab | own |
|---|---|---|---|---|
| ALU | CA | 500 | 200 | 700 |
| BEAR | CN | 40 | 10 | 50 |
| MOTOR (consumes ALU+BEAR) | CA | 0 | 300 | 300 |
| DRONE (root, consumes MOTOR, ST=true) | CA | 20 | 400 | 420 |

`total = 1470`, `canadian = 700+300+420 = 1420`, `pct = 1420/1470 = 96.6%`, last ST in CA → **MADE_IN_CANADA**.
`1420*100 = 142000`; `98*1470 = 144060` (fails 98); `51*1470 = 74970` (passes 51) → MADE_IN_CANADA. ✓

**Done when (M2.3):** `test_content.py` asserts this chain returns exactly `MADE_IN_CANADA` / `canadian_cost_cents == 1420` / `total_cost_cents == 1470`, and `foreign_assembly.json` returns `NONE` despite ≥98% cost.

---

## 5. API contract (`main.py` · lock before logic)

| Method | Path | Body / param | Returns |
|---|---|---|---|
| POST | `/attestations` | attestation JSON (payload + signature) | `{ "hash": "..." }` |
| GET | `/verify/{root_hash}` | path param | `VerificationResult` JSON |
| GET | `/health` | — | `{ "status": "ok" }` |

`VerificationResult` JSON: `designation`, `canadian_pct`, `total_cost_cents`, `canadian_cost_cents`, `cost_by_country`, `anomalies[]`. **Lock this shape now — the harness and the UI both bind to it.**

---

## 6. Lane A tasks — build to done on mock data

- **A1 — Graph builder + traversal** `(M2.2)` · `chain.py`. Build `Node`s from a flat list, populate `input_hashes`/`consumer_hashes` in one pass, store as `{hash: Node}`. Implement `topo_walk(root)` via **Kahn's algorithm** (gives topo order + cycle detection in one pass). **Done when:** `happy_path` builds the correct DAG; `cycle.json` is detected and returns the `CYCLE` fatal path.
- **A2 — Content math + verdict** `(M2.3)` · `content.py`. Implement §4. **Done when:** §4.3 assertions pass + `foreign_assembly` → `NONE`.
- **A3 — Precedence + structural checks** `(M3.1)` · `verify.py`. Implement §3.3 order; `BROKEN_LINK` (dangling ref), `CYCLE`, duplicate `(supplier_id, output.product_id)` serial → `REPLAY_DETECTED`, non-monotonic timestamp along an edge → flag. **Done when:** fixtures 2–5 each return the correct reason in the correct precedence.
- **A4 — Mass-balance** `(M3.2)` · `massbalance.py`. For each node, `Σ quantity_used by all consumers ≤ output.quantity`; else `MASS_BALANCE`. **Done when:** `overdraw.json` rejects, `happy_path` passes.
- **A5 — Anomaly score (advisory)** `(M3.3)` · `anomaly.py`. `IsolationForest` over features `[labour_cents/quantity, materials_cents/quantity, labour/materials ratio]`; output 0–1 per node, append `Anomaly(reason=ANOMALY, advisory=True)` above a threshold. **Must not change any verdict.** **Done when:** an inflated-cost node scores high while keeping a valid signature and unchanged designation.
- **A6 — Purchaser room** `(M4.2)` · `frontend/purchaser`. QR scan → `GET /verify/{hash}` → verdict card (percent · label · flags) + Cytoscape graph coloured by `Node.status`. Render against a **mock `VerificationResult`** first. **Done when:** scanning a QR shows the correct verdict + colour-coded graph; QR scanning works in a real browser (this is `M0.6` — prove it early).
- **A7 — Supplier room** `(M4.1)` · `frontend/supplier`. Form → validate against mock schema → confirm → sign → `POST /attestations`. **Done when:** a user creates and submits a valid signed attestation through the UI.
- **A8 — Demo script draft** `(M6.1)` and **A9 — Pitch deck** `(M6.3)`: draft against mock data; final numbers on the day. (`build-priority-plan-en.html` already exists for A9.)

---

## 7. Lane B tasks — skeleton now, swap on the day

- **B1 — Signature + schema verification** `(M2.1)` · `verify.py` + `adapters.py`. Build the full `validate → canonicalize → verify → resolve_key` flow using our own keys (from S2) and mock schema. **Done when (pre-event):** `happy_path` passes, `tampered` → `SIGNATURE_INVALID`. **Day-of swap:** real reference library (`verify`), real serialization (`canonicalize`), real registry (`resolve_key`).
- **B2 — Compose + internal self-test** `(M6.2)` · `docker-compose.yml`, `backend/Dockerfile`, a `make selftest` that runs all fixtures. Pin dependency versions; document the run command in README. **Done when:** a clean clone runs `docker compose up` and the internal self-test passes all fixtures. **Day-of swap:** run the provided official self-test harness; match the required service name/port/run command exactly.

---

## 8. Lane C — day-of only (do not pre-build; pre-build *around* it)

- **C1 — Adapter translation** `(M1.0)` · rewrite only the **bodies** of the six `adapters.py` functions to the real spec; swap mock data for the provided sample chains. Do not change signatures. This is the first thing done at kickoff and it blocks everything.
- **C2 — Confirm the 4 unknowns** before trusting any verdict: (1) how ST is identified → `find_last_st`; (2) cost-flow / partial-consumption rule → §4.1 + `get_costs`; (3) serialization DSSE vs JCS → `canonicalize`; (4) real field names / registry format / official self-test interface.
- **P3 (only if core is green):** NL verifier (NL → deterministic graph query, cites attestation IDs), conversational authoring, scripted anomaly demo, criticality overlay. All advisory; none touch the verdict.

---

## 9. Execution order (the agent works this list in order)

```
S1 → S3 → S2 → S4              # setup + the model + signed fixtures + adapter stubs
  → A1 (graph)                 # everything else needs the graph
  → B1 (sig+schema verify)     # gates which nodes enter the sum
  → A3 (precedence/structural)
  → A4 (mass-balance)
  → A2 (content math + verdict)# the scored core; depends on A1+B1 deciding valid nodes
  → A5 (anomaly, advisory)
  → B2 (compose + self-test)   # package early, keep it green
  → A6 (purchaser UI) ∥ A7 (supplier UI)   # parallel; bind to VerificationResult
  → A8/A9 (demo + deck)
  ── 30 May kickoff ──
  → C1 (adapter translation) → C2 (confirm unknowns) → re-run B2 self-test → submit
  → P3 only if everything above is green
```

**Stop rule:** do not start a P3 item until the core passes the happy path + all five test categories (fixtures 1–6) and `docker compose up` runs clean.

---

*RedTeam DefTech Ottawa · 30 May 2026 · TrueNorth · executable companion to dev-milestones.md, DESIGN.md, pre-event-checklist-en.md*
