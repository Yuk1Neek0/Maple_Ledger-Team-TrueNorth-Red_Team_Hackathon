# Maple Ledger — Developer Handover Guide

> Status as of 2026-05-30 (pre-event). All claims in this document point to specific files and line ranges so they can be verified directly against the source. Where the document and the code disagree, **the code wins** — please update this document.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [System architecture](#2-system-architecture)
3. [Tech stack](#3-tech-stack)
4. [How to run](#4-how-to-run)
5. [Repository structure](#5-repository-structure)
6. [Data model](#6-data-model)
7. [Data storage](#7-data-storage)
8. [Verification flow](#8-verification-flow)
9. [Canadian-content calculation](#9-canadian-content-calculation)
10. [Anomaly detection](#10-anomaly-detection)
11. [API documentation](#11-api-documentation)
12. [Demo walkthrough](#12-demo-walkthrough)
13. [Tests](#13-tests)
14. [Known limitations](#14-known-limitations)
15. [Roadmap / where to add value](#15-roadmap--where-to-add-value)
16. [Security notes](#16-security-notes)
17. [Environment variables](#17-environment-variables)
18. [Adapter-swap matrix (event-day playbook)](#18-adapter-swap-matrix-event-day-playbook)
19. [The 7 things you must understand before adding features](#19-the-7-things-you-must-understand-before-adding-features)
20. [Highest-impact add-ons](#20-highest-impact-add-ons)

---

## 1. Project overview

```text
Project name:        Maple Ledger
Purpose:             Cryptographic provenance verifier for Canadian supply chains.
Main users:          Suppliers (author signed attestations) + Purchasers (scan QR, see verdict).
Main problem solved: Decide whether a finished product qualifies as PRODUCT_OF_CANADA,
                     MADE_IN_CANADA, or NONE, by walking a signed supplier-attestation DAG
                     and applying Competition Bureau cost thresholds + last-substantial-
                     transformation rule.
Current status:      Pre-event MVP. Demo-quality. Not production-ready.
```

### What is working

- Backend `verifier-backend` (FastAPI, port 8000) — six routes, all green against 11 fixtures and 38 unit tests.
- Supplier UI (port 5174) — author payload, validate, Ed25519-sign in-browser, submit. Includes AI-draft helper.
- Purchaser UI (port 5173) — QR scan (or manual hash) → verify → verdict card + Cytoscape provenance graph + criticality overlay + NL Q&A ("Ask about this product").
- Adapter pattern (`backend/app/adapters.py` + `spec.py`) pre-staged for event-day spec swap: serialization JCS↔DSSE, cost-flow fraction↔full, ST rule flag/root/activity, multi-shape registry.
- Cross-language canonical-JSON byte-parity (Python `_jcs_bytes` ↔ JavaScript `canonical.js`) with a self-test that runs on supplier-UI load.
- Docker Compose stack (`docker-compose.yml`) brings up all three services in one command.
- Scripts: `seed.py` (load fixtures into running backend), `e2e_check.py` (live HTTP check), `selftest.py` (one-shot suite), `run_chain.py` (drop-in for the event-day chain).

### What is NOT working / not built yet

- **Persistent storage.** `STORE` is an in-memory `dict` on the backend process (`backend/app/main.py:43`). Restarting the container wipes every submitted attestation.
- **Worker scaling.** Module-level mutable state means `--workers > 1` would silo data per worker. Current Dockerfile starts one worker, which is fine for the hackathon.
- **Real production registry.** Mock registry committed at `data/registry.json`. Real format unknown until event day; multi-shape loader pre-staged (`backend/app/registry.py`).
- **Transparency log / Merkle anchoring.** Not implemented. Content addressing (SHA-256 of canonical bytes) is the only integrity anchor.
- **DID / HSM / YubiKey support.** Not implemented. All private keys are 32-byte Ed25519 seeds, mock keys derived from `sha256("maple-ledger-mock-v1::" + supplier_id)`.
- **Production secrets.** Demo supplier private seeds are shipped in `frontend/supplier/src/devIdentities.js` — explicitly DEV ONLY.
- **Mock-mode default in purchaser UI.** Defaults to canned mock data (`USE_MOCK=true`); `?mock=0` query param is required to hit the live backend.
- **Cycle anomaly carries no per-node detail.** Cycle members aren't enumerated; only `root_hash` is referenced (`backend/app/verify.py:34`).

---

## 2. System architecture

### Container topology

```
                          Browser (laptop / phone)
                           │              │
       http://localhost:5174              http://localhost:5173
                           │              │
                  ┌────────▼─────┐  ┌─────▼────────┐
                  │ supplier-ui  │  │ purchaser-ui │      (nginx serving Vite-built static)
                  │ React + Vite │  │ React + Vite │      Both depend_on verifier-backend
                  │  Tailwind 4  │  │  Tailwind 4  │
                  │   noble/ed   │  │  Cytoscape   │
                  │ noble/hashes │  │ html5-qrcode │
                  └──────┬───────┘  └──────┬───────┘
                         │                 │
                         └────────┬────────┘
                                  │  CORS open (allow_origins=["*"])
                                  ▼
                         http://localhost:8000
                       ┌─────────────────────┐
                       │  verifier-backend   │
                       │  FastAPI / uvicorn  │      python:3.11-slim
                       │  port 8000          │      healthcheck: /health every 10s
                       │                     │
                       │   In-memory STORE   │      ── dict[hash, wire_dict]
                       │   In-memory REGISTRY│      ── dict[sid, {public_key, verified}]
                       └─────────┬───────────┘
                                 │
                  loaded once at lifespan startup
                                 │
                       ┌─────────▼───────────┐
                       │  /data/registry.json│      mounted via Dockerfile COPY
                       │  /schema/*.json     │
                       └─────────────────────┘
```

### Pipeline of responsibilities

```
                    Supplier UI
                  (author + sign)
                        │
                        ▼ POST /attestations  (signed wire dict)
                        │
                  Backend API   ──────  schema validation (jsonschema)
                        │       ──────  hash = SHA-256(canonicalize(payload))
                        │       ──────  STORE[hash] = wire_dict
                        ▼
                  (later)  GET /verify/{root_hash}
                        │
                  Verifier engine
                        │
   ┌────────────────────┴──────────────────────────────┐
   │ 1. scope chain by reachable() from root           │
   │ 2. topo walk (Kahn) — cycle is fatal              │
   │ 3. per-node precedence:                           │
   │      UNKNOWN_ISSUER → SIGNATURE_INVALID →         │
   │      REPLAY_DETECTED → BROKEN_LINK                │
   │ 4. temporal monotonicity (advisory)               │
   │ 5. mass-balance (hard reject)                     │
   │ 6. cost attribution (fraction or full)            │
   │ 7. per-node subtree % (display only)              │
   │ 8. criticality overlay (display only)             │
   │ 9. designation (98% / 51% + last_st_in_ca)        │
   │10. force NONE if root invalid or mass_balance hit │
   │11. advisory ML anomalies (IsolationForest)        │
   │12. serialize VerificationResult + graph topology  │
   └──────────────────────┬────────────────────────────┘
                          │
                          ▼ JSON
                  Purchaser UI
              (verdict card + graph)
```

### Component-by-component

| Component | What it does | Source |
|---|---|---|
| Supplier UI | Form → validate → canonicalize → Ed25519 sign in browser → POST `/attestations`. Includes AI-draft helper. | `frontend/supplier/src/App.jsx` |
| Purchaser UI | Scan QR (or manual hash) → GET `/verify` → render verdict + cost breakdown + provenance graph + criticality + Ask panel. | `frontend/purchaser/src/App.jsx` |
| Backend API | 6 routes: `/health`, `POST /attestations`, `GET /verify/{hash}`, `GET /registry`, `POST /draft`, `POST /ask`. | `backend/app/main.py` |
| Storage | Two in-memory dicts: `STORE` (attestations) loaded on submit, `REGISTRY` loaded once at lifespan startup. | `backend/app/main.py:43-44`; `backend/app/registry.py` |
| Verifier | Precedence engine + verdict assembly. | `backend/app/verify.py` |
| Graph builder | DAG with `by_hash` index + bidirectional edges + Kahn topo. | `backend/app/chain.py` |
| Cost math | Consumption-fraction OR full-cost attribution; integer cents; cross-multiplication. | `backend/app/content.py` |
| Mass-balance | Producer overdraw detection. | `backend/app/massbalance.py` |
| Anomaly detection | IsolationForest (`sklearn`) over cost-shape features; z-score fallback for n<3. **Advisory only.** | `backend/app/anomaly.py` |
| Criticality overlay | Deterministic heuristic (no ML): critical / standard / commodity. **Advisory only.** | `backend/app/criticality.py` |
| LLM advisory layer | `/draft` (NL → attestation) and `/ask` (NL Q&A over verified result). Optional, gated by `ANTHROPIC_API_KEY`. | `backend/app/llm.py`; `backend/app/main.py:84,116` |
| Adapters | The 6 seams that absorb event-day spec uncertainty. | `backend/app/adapters.py` |
| Spec selector | One env-driven module that flips adapter behavior. | `backend/app/spec.py` |
| Demo scripts | `seed.py`, `e2e_check.py`, `run_chain.py`, `selftest.py`, `spike_claude.py`. | `scripts/` |

---

## 3. Tech stack

| Layer | Tech used | Why |
|---|---|---|
| Backend framework | FastAPI 0.115.6 + uvicorn 0.34.0 | Locked I/O contract, typed bodies, lifespan hook for registry load, built-in OpenAPI |
| Language / runtime | Python 3.11 (slim Docker image) | Modern typing, dataclasses with `frozen=True`, fast startup |
| Schema validation | jsonschema 4.23.0 | Backend validates wire payloads at `POST /attestations` |
| HTTP client | httpx 0.28.1 | Used by `llm.py` to call Anthropic; no SDK dependency |
| Crypto | `cryptography` 44.0.0 (`Ed25519PublicKey/PrivateKey`) | Industry-standard, primer-confirmed reference lib for event day |
| ML | scikit-learn 1.6.1 + numpy 2.2.1 | IsolationForest for advisory anomaly score |
| Frontend framework | React 19 + Vite 8 | Fast dev loop, ES-module-native |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite`) | Utility-first; matches the team's design docs |
| Graph rendering | Cytoscape.js 3.33 | Lightweight DAG layout; breadthfirst directed layout |
| QR scanning | html5-qrcode 2.3.8 | Pure JS, no native deps |
| Browser crypto | `@noble/ed25519` 3.1.0 + `@noble/hashes` 2.2.0 | Browser-safe Ed25519; v3 requires SHA-512 injection (`crypto.js:11`) |
| Deployment | Docker Compose v2 | Three services on one network |
| Testing | pytest (backend) | 38 tests across 6 files; `scripts/selftest.py` runs the suite and optional live HTTP checks |
| LLM (optional) | Anthropic Claude (`claude-haiku-4-5-20251001` default) | Key-optional advisory layer for `/draft` + `/ask` |

### Versions that matter

- **Python 3.11** specifically — `from __future__ import annotations` is used widely, and several files rely on PEP 604 union syntax.
- **`cryptography` 44.x** — `Ed25519PublicKey.from_public_bytes(...)` and `verify(...)` raise `InvalidSignature`, which the adapter wraps.
- **`@noble/ed25519` 3.x** — major API break vs 2.x; v3 requires `ed.hashes.sha512 = sha512` at module load. Already wired (`frontend/supplier/src/lib/crypto.js:11`).
- **Vite 8** + **React 19** — uses the new `createRoot` API and StrictMode by default.

### Fragile areas

- **JCS byte parity between Python and JavaScript.** Any divergence breaks every signature. Guarded by `runCanonicalSelfTest()` (`frontend/supplier/src/lib/canonical.test.js`), which runs on supplier-UI load and emits a header badge.
- **Event-day spec assumptions** are pre-staged but not verified against the real spec. See [§18](#18-adapter-swap-matrix-event-day-playbook).
- **Floating-point flow propagation** in `content._attribute_fraction` uses Python floats internally; only the rounded result is integer. Long chains with non-unitary `quantity_used/produced` ratios could see ±1 cent drift.
- **In-memory `STORE`** — every restart clears it.

---

## 4. How to run

### Prerequisites

- Docker Desktop or Docker Engine + `docker compose` v2
- (Optional) Python 3.11 + Node 22 if you want to run dev servers outside Docker

### Quick start — Docker (recommended)

```bash
git clone git@github.com:Yuk1Neek0/Red-Team-Hackathon.git
cd Red-Team-Hackathon
cp .env.example .env           # optional — only needed if you want ANTHROPIC_API_KEY enabled
docker compose up --build
```

Once `verifier-backend` reports healthy:

| Service | URL |
|---|---|
| Backend API | http://localhost:8000 |
| Backend health | http://localhost:8000/health |
| OpenAPI Swagger | http://localhost:8000/docs |
| OpenAPI ReDoc | http://localhost:8000/redoc |
| Purchaser UI | http://localhost:5173 (mock mode) or http://localhost:5173/?mock=0 (live) |
| Supplier UI | http://localhost:5174 |

### Seeding demo data (in-memory, gone on restart)

```bash
python scripts/seed.py
```

Prints a table of every fixture's `root_hash`. Paste any of those into the purchaser UI at `http://localhost:5173/?mock=0`.

### Running tests

```bash
cd backend && python -m pytest -q                  # unit suite
python scripts/selftest.py                          # unit + (if backend is up) live HTTP check
python scripts/e2e_check.py                         # live HTTP check against running backend only
```

### Local (non-Docker) development

Backend:

```bash
python -m venv .venv
source .venv/bin/activate                          # PowerShell: .venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
python data/tools/gen_mock.py                       # regenerate registry + fixtures
uvicorn app.main:app --app-dir backend --reload
```

Frontend (each in its own terminal):

```bash
cd frontend/supplier && npm ci && npm run dev      # → http://localhost:5174-ish
cd frontend/purchaser && npm ci && npm run dev     # → http://localhost:5173
```

### Common problems

| Symptom | Fix |
|---|---|
| `EADDRINUSE` on 8000 / 5173 / 5174 | Kill the process holding the port, or remap in `docker-compose.yml` / `vite.config.js`. |
| Purchaser UI shows the same result for every hash | You're in mock mode. Append `?mock=0` to the URL. |
| Backend returns `404` for a known root hash | `STORE` is empty — re-run `scripts/seed.py` or POST attestations via the supplier UI. |
| `/draft` and `/ask` return 503 | `ANTHROPIC_API_KEY` is not set. Add it to `.env` (root, for Docker) or `backend/.env` (for local dev). |
| Supplier UI's "canonical self-test: FAIL" badge | Browser-side canonicalization diverged from backend. Check `frontend/supplier/src/lib/canonical.js` and `_jcs_bytes` in `backend/app/adapters.py`. |
| `docker compose up` fails to build the backend | Confirm Python 3.11 base image is reachable; check `backend/requirements.txt` versions are still on PyPI. |
| Camera permission denied | `getUserMedia` requires HTTPS or `http://localhost`. Use the manual hash entry below the scanner. |

---

## 5. Repository structure

```
Red-Team-Hackathon/
├── README.md                       short quickstart (Docker + local + tests)
├── HANDOVER.md                     this document
├── .env.example                    root .env template (Docker reads this)
├── .gitignore
├── docker-compose.yml              3 services: verifier-backend, purchaser-ui, supplier-ui
│
├── backend/
│   ├── Dockerfile                  python:3.11-slim → uvicorn
│   ├── requirements.txt            pinned versions
│   └── app/
│       ├── __init__.py             empty package marker
│       ├── main.py                 FastAPI app + 6 routes
│       ├── models.py               frozen internal contract
│       ├── adapters.py             the 6 event-day seams + canonicalization
│       ├── spec.py                 env-driven variant selectors
│       ├── chain.py                SupplyChain DAG + Kahn topo
│       ├── verify.py               precedence engine + verdict assembly
│       ├── content.py              Canadian-content math + designation
│       ├── massbalance.py          producer overdraw check
│       ├── anomaly.py              IsolationForest advisory scorer
│       ├── criticality.py          deterministic critical/standard/commodity overlay
│       ├── registry.py             multi-shape registry loader
│       └── llm.py                  optional Anthropic Claude HTTP client
│   └── tests/
│       ├── test_smoke.py           app boots, hash round-trip, locked shape
│       ├── test_verify.py          verdict + reason across all fixtures + cycle guard
│       ├── test_spec.py            adapter swap variants (JCS/DSSE, fraction/full, registry shapes)
│       ├── test_anomaly.py         IsolationForest scoring + advisory contract
│       ├── test_robustness.py      graceful degradation
│       ├── test_ai.py              key-optional behavior of /draft + /ask
│       └── fixtures/               11 generated chains (see §12)
│
├── schema/
│   └── attestation.schema.json     BACKEND wire schema (signature required, additionalProperties: true)
│
├── data/
│   ├── registry.json               4 mock suppliers' public keys (committed)
│   ├── dev/                        gitignored; dev_keys.json (private seeds) lives here
│   └── tools/
│       └── gen_mock.py             deterministic generator for registry + 11 fixtures
│
├── scripts/
│   ├── seed.py                     POST all fixtures into a running backend
│   ├── e2e_check.py                live HTTP runner with assertions
│   ├── run_chain.py                event-day kickoff harness (drop in any chain JSON)
│   ├── selftest.py                 pytest + optional live HTTP
│   └── spike_claude.py             confirm ANTHROPIC_API_KEY end-to-end
│
├── frontend/
│   ├── supplier/                   Vite + React 19 (port 5174)
│   │   ├── Dockerfile              node:22-alpine build → nginx:alpine serve
│   │   ├── vite.config.js
│   │   ├── package.json            @noble/ed25519, @noble/hashes, tailwind
│   │   ├── index.html
│   │   ├── public/                 favicon, icons
│   │   └── src/
│   │       ├── main.jsx            React 19 createRoot + StrictMode
│   │       ├── App.jsx             the entire authoring flow (765 LOC)
│   │       ├── index.css           Tailwind directives
│   │       ├── devIdentities.js    4 dev-only Ed25519 seeds
│   │       ├── schema/
│   │       │   └── attestation.schema.json    SIGNED-PAYLOAD schema (signature omitted, strict)
│   │       └── lib/
│   │           ├── canonical.js         JCS in JS — byte-matches backend
│   │           ├── canonical.test.js    runs on UI load AND via `node`
│   │           ├── crypto.js            Ed25519 sign + verify, hex/base64 helpers
│   │           ├── validate.js          hand-rolled validator (mirrors schema)
│   │           └── api.js               POST /attestations
│   │
│   └── purchaser/                  Vite + React 19 (port 5173)
│       ├── Dockerfile
│       ├── vite.config.js          binds to localhost (camera needs secure context)
│       ├── package.json            cytoscape, html5-qrcode, tailwind
│       ├── index.html
│       ├── .env.example            VITE_BACKEND_URL, VITE_USE_MOCK
│       ├── public/                 maple.svg favicon
│       └── src/
│           ├── main.jsx
│           ├── App.jsx             scan/manual → verify → render verdict + graph + ask (801 LOC)
│           ├── api.js              fetchVerification(rootHash)
│           ├── config.js           USE_MOCK + BACKEND_URL resolution
│           ├── mockData.js         3 canned VerificationResults + mockGraph
│           ├── labels.js           designation labels, anomaly labels, formatters
│           ├── index.css           Tailwind directives
│           └── components/
│               ├── QrScanner.jsx          html5-qrcode wrapper + manual fallback
│               ├── VerdictCard.jsx        big badge + Canadian % + breakdown + anomalies
│               ├── CostBreakdown.jsx      stacked bar + per-country rows
│               ├── AnomalyList.jsx        hard vs advisory cards
│               └── ProvenanceGraph.jsx    Cytoscape DAG
│
├── developing/                     pre-event planning docs (read-only reference)
│   ├── DESIGN.md                   system-design reference with Mermaid diagrams
│   ├── build-execution-plan-en.md  task-by-task plan (mirrors current code structure)
│   ├── build-adopt-ai-plan.md      AI adoption guardrails
│   ├── cryptographic-provenance-technical-primer_1.md
│   ├── demo-script.md              suggested demo flow
│   ├── dev-milestones.md           milestone breakdown
│   ├── kickoff-checklist.md        event-day day-of checklist
│   ├── pre-event-checklist-en.md
│   ├── pre-event-remaining-plan.md
│   └── build-priority-plan-en.html
│
├── doc/                            additional design docs (mirror of developing/ + decks)
│   ├── DESIGN.md
│   ├── data-contract.md
│   ├── data-contract-v0.2-draft.md
│   ├── deck-en.html, onepager-en.html, pitch-en 1.html
│   ├── how-it-works-en.md, how-it-works-deck-en.html
│   ├── maple_ledger_full_architecture.svg
│   ├── Maple_Ledger_Design_Document.docx
│   └── …
│
└── 5.30/
    ├── 01-implementation-record.md
    └── 02-event-day-swap-guide.md
```

### Key files at a glance

| File | What it does | LOC |
|---|---|---|
| `backend/app/main.py` | FastAPI app, lifespan, all 6 HTTP routes | 149 |
| `backend/app/models.py` | `Attestation`, `Node`, `VerificationResult`, enums (frozen contract) | 97 |
| `backend/app/adapters.py` | 6 seams + shared canonicalization + Ed25519 verify | 183 |
| `backend/app/verify.py` | `Verifier.verify`, `verify_root`, `chain_to_graph`, `result_to_dict` | 198 |
| `backend/app/chain.py` | `SupplyChain`, `reachable()`, `topo_walk()` (Kahn), `build_chain()` | 69 |
| `backend/app/content.py` | `attribute_costs`, `subtree_percents`, `designate` | 108 |
| `backend/app/massbalance.py` | `check(chain)` — overdraw detection | 22 |
| `backend/app/anomaly.py` | `score(nodes, threshold=0.6)` — advisory IsolationForest | 135 |
| `backend/app/criticality.py` | `classify(node)` — deterministic critical/standard/commodity | 26 |
| `backend/app/registry.py` | `load_registry()` + `_normalize()` (multi-shape) | 47 |
| `backend/app/spec.py` | `SERIALIZATION`, `ST_STRATEGY`, `COST_FLOW`, env-driven | 35 |
| `backend/app/llm.py` | `available()`, `complete()`, `complete_json()` via httpx | 69 |
| `data/tools/gen_mock.py` | Generates `data/registry.json` + 11 fixtures deterministically | 202 |
| `frontend/supplier/src/App.jsx` | 3-step flow (form → confirm → done) + AI draft + demo identities | 765 |
| `frontend/supplier/src/lib/canonical.js` | JCS in JS — must byte-match backend | 82 |
| `frontend/supplier/src/lib/crypto.js` | Ed25519 ops via @noble | 109 |
| `frontend/purchaser/src/App.jsx` | Scan/verify/render + Ask panel + Manual modal | 801 |
| `frontend/purchaser/src/components/ProvenanceGraph.jsx` | Cytoscape DAG render | 145 |

---

## 6. Data model

> The data model is the *frozen internal contract* (`backend/app/models.py`). The event-day spec only touches `adapters.py`; nothing else uses a raw spec field name. **Money is integer cents everywhere above the adapter.**

### 6.1 `Attestation` — the signed unit

```python
# backend/app/models.py:27-38
@dataclass(frozen=True)
class Attestation:
    supplier_id: str                            # maps to a registry keyid
    output: Output                              # what was produced
    inputs: tuple[InputRef, ...]                # what was consumed (tuple for hashability)
    materials_cents: int                        # >= 0, integer cents
    labour_cents: int                           # >= 0, integer cents
    work_country: str                           # ISO-2, e.g. "CA", "CN"
    is_substantial_transformation: bool         # spec-dependent flag
    timestamp: str                              # ISO-8601 (used only for ordering checks)
    signature: str                              # base64 Ed25519 over canonicalize(payload)
```

### 6.2 `Output` and `InputRef`

```python
# backend/app/models.py:14-25
@dataclass(frozen=True)
class Output:
    product_id: str
    quantity: int                               # integer units
    unit: str                                   # e.g. "kg", "pcs"

@dataclass(frozen=True)
class InputRef:
    attestation_hash: str                       # content hash of the consumed attestation
    quantity_used: int                          # how much of that output this node consumed
```

### 6.3 Wire shape (what HTTP actually carries)

```json
{
  "supplier_id": "SUP-DRONE",
  "output": { "product_id": "drone_X1", "quantity": 1, "unit": "pcs" },
  "inputs": [
    { "attestation_hash": "1b4448a6cd3161c0c15a6e058887553d7181a31cb0ef6bdce3ce8b99aeb07071",
      "quantity_used": 1 }
  ],
  "materials_cents": 20,
  "labour_cents": 400,
  "work_country": "CA",
  "is_substantial_transformation": true,
  "timestamp": "2026-05-03T08:00:00Z",
  "signature": "rQSOdE9MBr3we89SLx4MJTlXdpOEW4xw1HRS1OUfMDOKQi6IS/IkZuRAx8tdYKBywJpl6pi8c10HLSZWa4UwBA=="
}
```

### 6.4 What gets signed

```python
# backend/app/adapters.py:27-46
def payload_dict(att) -> dict:
    """The signed payload: the attestation MINUS its signature."""
    return {
        "supplier_id": ..., "output": {...}, "inputs": [...],
        "materials_cents": ..., "labour_cents": ...,
        "work_country": ..., "is_substantial_transformation": ...,
        "timestamp": ...,
    }
```

- `signature` is **not** part of the signed bytes.
- `compute_hash(att) = SHA-256(canonicalize(payload_dict(att)))` → 64-char lowercase hex (`adapters.py:48`).
- Inputs are linked by content hash, not pointer — so a dangling reference is *representable data* (BROKEN_LINK), not a crash (`chain.py`).
- `quantity_used` is integer in our model; the consumption-fraction `q/Q` is the only float path (see [§9](#9-canadian-content-calculation)).

### 6.5 `Node` — the mutable verifier wrapper

```python
# backend/app/models.py:67-80
@dataclass
class Node:
    attestation: Attestation
    hash: str
    input_hashes: list[str]                     # = [r.attestation_hash for r in att.inputs]
    consumer_hashes: list[str]                  # populated by build_chain() second pass
    sig_valid: bool = False
    signer_known: bool = False
    status: Status = Status.OK                  # OK or INVALID
    reason: Reason | None = None                # populated on first-match failure
    subtree_percent: float = 0.0                # display-only (CA% over reachable subtree)
    contribution_cents: int = 0                 # display-only (this node's flow-weighted contrib)
    annotations: dict = field(default_factory=dict)  # overlays (criticality, activity)
    anomalies: list[Anomaly] = field(default_factory=list)
```

Separating `Attestation` (immutable, signed) from `Node` (mutable verifier state) is deliberate — annotating the signed object in place would change its hash and break references (`developing/DESIGN.md:84-87`).

### 6.6 `VerificationResult` — the API response

```python
# backend/app/models.py:89-97
@dataclass
class VerificationResult:
    designation: Designation                    # PRODUCT_OF_CANADA | MADE_IN_CANADA | NONE
    canadian_pct: float                         # display only; derived from cents
    total_cost_cents: int
    canadian_cost_cents: int
    cost_by_country: dict[str, int]             # country code → cents
    anomalies: list[Anomaly]
    graph: dict | None = None                   # {nodes, edges} topology for the UI
```

### 6.7 `Anomaly`

```python
# backend/app/models.py:59-64
@dataclass
class Anomaly:
    reason: Reason
    attestation_hash: str
    detail: str
    advisory: bool = False                      # True for ANOMALY + TEMPORAL_INVERSION
```

### 6.8 Enums

```python
# backend/app/models.py:42-56
class Status(str, Enum):  OK, INVALID

class Reason(str, Enum):                        # precedence order top→bottom
    MALFORMED                                   # rejected at POST /attestations
    SIGNATURE_INVALID
    UNKNOWN_ISSUER
    REPLAY_DETECTED
    BROKEN_LINK
    CYCLE                                       # chain-fatal
    MASS_BALANCE                                # quantity overdraw — HARD reject
    TEMPORAL_INVERSION                          # advisory only
    ANOMALY                                     # advisory only (IsolationForest)

class Designation(str, Enum):
    PRODUCT_OF_CANADA, MADE_IN_CANADA, NONE
```

### 6.9 Supplier (in the registry)

There is **no `Supplier` class**. The registry is a `dict[supplier_id, {public_key: Ed25519PublicKey, verified: bool}]` loaded from `data/registry.json`:

```json
// data/registry.json
{
  "SUP-ALU":   { "public_key": "6509beb7…f02bcc", "verified": true },
  "SUP-BEAR":  { "public_key": "5b19234a…871af",  "verified": true },
  "SUP-MOTOR": { "public_key": "049d9db4…f4da3",  "verified": true },
  "SUP-DRONE": { "public_key": "7951412b…0979c4", "verified": true }
}
```

Names, country of incorporation, status — none of those are in the current model. They would be added via `registry.py:_normalize()` when the real registry format arrives.

### 6.10 Note on the template's richer shape

If you've seen the template in `developing/cryptographic-provenance-technical-primer_1.md` referring to `costs.labour_canadian / labour_foreign / materials_added_canadian / materials_added_foreign` and `activity`, `location.country` — that is **not what the current code uses**. Current mock uses single integer fields (`materials_cents`, `labour_cents`) with a single `work_country`. The richer shape is what's expected to arrive on event day; the [adapter-swap matrix](#18-adapter-swap-matrix-event-day-playbook) is where that mapping happens (`adapters.attestation_from_dict` + `adapters.get_costs`).

---

## 7. Data storage

| Data | Where it lives | Why | Survives restart? |
|---|---|---|---|
| Supplier registry | `data/registry.json` (mounted at `/data/registry.json` in container) | Source of truth for public keys + `verified` flag | YES — file on disk |
| In-memory parsed registry | `REGISTRY: dict` in `backend/app/main.py:44` | Loaded once at lifespan startup | NO — process-local |
| Submitted attestations | `STORE: dict[hash, wire_dict]` in `backend/app/main.py:43` | Indexed by content hash for `/verify` lookup | **NO** — gone on container restart |
| Schema cache | `_schema_cache: dict | None` in `backend/app/adapters.py:23` | Avoids re-reading the file on every validate | NO — process-local |
| Dev private keys | `data/dev/dev_keys.json` (gitignored via `.gitignore`) | Lets supplier UI's demo-identity dropdown sign as a registered supplier | YES — file on disk |
| Fixtures | `backend/tests/fixtures/*.json` | Test inputs and demo seed data | YES — committed |
| LLM API key | `ANTHROPIC_API_KEY` env var (root `.env` for Docker; `backend/.env` for local) | Enables `/draft` + `/ask`; absence is fine | YES — file or env |

### What happens at `POST /attestations` (current implementation)

```
1. Backend FastAPI receives the JSON body
2. adapters.validate(obj)              ── jsonschema against schema/attestation.schema.json
3. adapters.attestation_from_dict(obj) ── wire dict → typed Attestation
4. adapters.compute_hash(att)          ── SHA-256(canonicalize(payload_dict(att)))
5. STORE[h] = obj                      ── stored as the original wire dict (not the Attestation)
6. Response: {"hash": h}
```

Notes:
- The wire dict is stored, not the typed object. `attestation_from_dict` is re-run on every `/verify` for every entry in scope. This means a malformed entry in `STORE` doesn't crash neighboring verifies (`verify.py:140-144` wraps the parse in try/except).
- **There is no transparency log, no Merkle anchor, no append-only storage.** The only integrity anchor is content addressing — recomputing the hash from the canonical bytes is what proves the wire dict matches its declared id.
- **There is no DB.** A SQLite drop-in is acknowledged as a later step (`backend/app/main.py:42`) but not implemented.

---

## 8. Verification flow

> Input: a root attestation hash. Output: a `VerificationResult` JSON. Entry point: `verify.verify_root(STORE, REGISTRY, root_hash)` (`backend/app/verify.py:134-149`).

### Pseudocode (the actual pipeline, lightly simplified)

```python
def verify_root(store: dict[str, dict],
                registry: dict[str, {public_key, verified}],
                root_hash: str) -> VerificationResult:

    # 1. Parse every store entry, skip malformed
    atts = []
    for v in store.values():
        try:    atts.append(attestation_from_dict(v))
        except: pass                                       # graceful degradation

    # 2. Build the full DAG, scope to what's reachable from root
    full = build_chain(atts, root_hash)
    reachable = full.reachable()                           # DFS, follows present input edges
    scoped = [full.by_hash[h].attestation for h in reachable]
    chain = build_chain(scoped, root_hash)

    return Verifier(registry).verify(chain)


def Verifier.verify(chain) -> VerificationResult:
    order, has_cycle = chain.topo_walk()                   # Kahn's algorithm

    # 3. Cycle is fatal
    if has_cycle:
        return result(NONE, [Anomaly(CYCLE, root_hash, ...)])

    seen_serial: dict[tuple, str] = {}

    # 4. Per-node precedence — first match wins
    for h in order:
        node, att = chain.by_hash[h], node.attestation

        # 4a. Issuer in registry and verified
        pub, verified = resolve_key(att.supplier_id, registry)
        if not (pub and verified):
            fail(node, UNKNOWN_ISSUER); continue

        # 4b. Signature over canonical bytes
        msg = canonicalize(payload_dict(att))
        if not verify_ed25519(msg, b64decode(att.signature), pub):
            fail(node, SIGNATURE_INVALID); continue

        # 4c. Replay: (supplier_id, output.product_id) must be unique
        key = (att.supplier_id, att.output.product_id)
        if key in seen_serial:
            fail(node, REPLAY_DETECTED); continue
        seen_serial[key] = h

        # 4d. Broken link: input hash absent from scoped chain
        missing = [ih for ih in node.input_hashes if ih not in chain.by_hash]
        if missing:
            fail(node, BROKEN_LINK, detail=f"missing input {missing[0]}"); continue

        # 4e. Duplicate input reference
        if len(node.input_hashes) != len(set(node.input_hashes)):
            fail(node, BROKEN_LINK, detail="duplicate input reference"); continue

    # 5. Temporal monotonicity — advisory only
    for h in order:
        for ref in node.attestation.inputs:
            p = chain.by_hash.get(ref.attestation_hash)
            if p and node.attestation.timestamp < p.attestation.timestamp:
                anomalies.append(Anomaly(TEMPORAL_INVERSION, h, ..., advisory=True))

    # 6. Mass-balance: producer overdraw is a hard reject
    for h, detail in massbalance.check(chain).items():
        if chain.by_hash[h].status == OK:
            fail(chain.by_hash[h], MASS_BALANCE, detail)

    # 7. Cost attribution over surviving (OK) nodes
    valid = {h for h in order if chain.by_hash[h].status == OK}
    total, canadian, by_country = content.attribute_costs(chain, valid)

    # 8. Per-node subtree % (display only)
    for h, p in content.subtree_percents(chain, valid).items():
        chain.by_hash[h].subtree_percent = p

    # 9. Criticality overlay (display only)
    for node in chain.by_hash.values():
        node.annotations["criticality"] = criticality.classify(node)

    # 10. Designation
    last_st = adapters.find_last_st(chain)
    last_st_in_ca = last_st and last_st.attestation.work_country == "CA"
    designation = content.designate(total, canadian, last_st_in_ca)

    # 11. Forced NONE override
    root = chain.by_hash.get(chain.root_hash)
    if root is None or root.status != OK or any(a.reason == MASS_BALANCE for a in anomalies):
        designation = NONE

    # 12. Advisory ML anomalies
    anomalies.extend(anomaly.score(chain.by_hash.values()))

    # 13. Assemble + serialize
    return VerificationResult(designation, canadian/total, total, canadian, by_country,
                              anomalies, graph=chain_to_graph(chain))
```

### Step-by-step explanation

| # | Step | What it enforces | Source |
|---|---|---|---|
| 1 | Parse store entries | Malformed entries don't crash unrelated chains | `verify.py:140-144` |
| 2 | Scope by reachable() from root | A shared raw-material lot can't appear over-consumed across products | `verify.py:138-148` |
| 3 | Topo walk + cycle detection | Cycle is structurally fatal (Designation.NONE, return early) | `chain.py:34-53`, `verify.py:33-37` |
| 4a | `UNKNOWN_ISSUER` | Supplier not in registry OR `verified=False` | `verify.py:45-49` |
| 4b | `SIGNATURE_INVALID` | Ed25519 verify on canonical bytes failed | `verify.py:52-56` |
| 4c | `REPLAY_DETECTED` | `(supplier_id, output.product_id)` reused within scoped chain | `verify.py:58-63` |
| 4d | `BROKEN_LINK` (missing) | Input hash absent from scoped chain | `verify.py:65-69` |
| 4e | `BROKEN_LINK` (duplicate) | Same input hash listed twice | `verify.py:71-74` |
| 5 | `TEMPORAL_INVERSION` (advisory) | Consumer timestamp earlier than its input's | `verify.py:77-85` |
| 6 | `MASS_BALANCE` (hard) | `Σ quantity_used by consumers > output.quantity` for any producer | `verify.py:88-90`, `massbalance.py` |
| 7 | Cost attribution | See [§9](#9-canadian-content-calculation) | `content.py:38-69` |
| 8 | Per-node subtree % | Display-only data for the graph view | `content.py:72-98`, `verify.py:97-98` |
| 9 | Criticality | Display-only `critical/standard/commodity` overlay | `criticality.py`, `verify.py:101-102` |
| 10 | Designation | `total==0 or not last_st_in_ca` → NONE; `≥98*total` → POC; `≥51*total` → MIC; else NONE | `content.py:101-108` |
| 11 | Forced override | Root invalid OR any MASS_BALANCE forces NONE | `verify.py:109-113` |
| 12 | Advisory ML | IsolationForest scoring, `advisory=True` | `verify.py:116-120`, `anomaly.py` |
| 13 | Serialize | `result.graph = chain_to_graph(chain)` → `{nodes, edges}` for the UI | `verify.py:122-125`, `verify.py:161-186` |

### Key data shapes flowing through

| Stage | Type |
|---|---|
| Raw HTTP body | `dict` (wire JSON) |
| After parse | `Attestation` (frozen) |
| After hash | `str` (64-hex content id) |
| After build | `SupplyChain` with `by_hash: dict[str, Node]` |
| After topo | `order: list[str]`, `has_cycle: bool` |
| After precedence | `Node.status ∈ {OK, INVALID}`, `Node.reason ∈ Reason|None` |
| After cost | `total: int, canadian: int, by_country: dict[str,int]` |
| Final | `VerificationResult` with `graph: dict` |
| Wire | `dict` again, via `verify.result_to_dict` |

---

## 9. Canadian-content calculation

### Formula (current default — consumption-fraction mode)

```text
flow(root) = 1.0

for each consumer C with input N consumed by quantity q out of producer N's output Q:
    flow(N) += (q / Q) * flow(C)

for each VALID node N:
    own_cost(N)   = materials_cents(N) + labour_cents(N)        # integer cents
    contrib(N)    = round(own_cost(N) * flow(N))                # integer cents

total_cost_cents    = Σ contrib(N) over all valid N
canadian_cost_cents = Σ contrib(N) for valid N where work_country == "CA"
canadian_pct        = canadian_cost_cents / total_cost_cents    # display only
```

Source: `backend/app/content.py:38-69`.

### Designation

```python
# backend/app/content.py:101-108
def designate(total, canadian, last_st_in_ca):
    if total == 0 or not last_st_in_ca:               return NONE
    if canadian * 100 >= 98 * total:                  return PRODUCT_OF_CANADA
    if canadian * 100 >= 51 * total:                  return MADE_IN_CANADA
    return NONE
```

Two conditions, both required:
1. Cost threshold (≥98% or ≥51%).
2. **Last substantial transformation in Canada.** Comparisons are integer cross-multiplication — never divide-then-compare.

### Worked example — happy-path drone chain

```
Node     work_country   materials   labour   own_cost
─────────────────────────────────────────────────────
ALU      CA              500        200      700        (leaf)
BEAR     CN               40         10       50        (leaf)
MOTOR    CA                0        300      300        consumes 1× ALU, 1× BEAR  (ST=true)
DRONE    CA               20        400      420        consumes 1× MOTOR         (ST=true, root)
```

All consumption is 1-for-1, so `flow = 1.0` everywhere:

```
total       = 700 + 50 + 300 + 420 = 1470 cents
canadian    = 700 +      300 + 420 = 1420 cents
pct         = 1420 / 1470 = 96.6%

1420 * 100 = 142,000
 98 * 1470 = 144,060   →  fails ≥ 98
 51 * 1470 =  74,970   →  passes ≥ 51

last ST in CA? DRONE has is_substantial_transformation=true, work_country=CA → YES
              → MADE_IN_CANADA  ✓
```

Asserted by `backend/tests/test_verify.py:26-34` (`test_happy_path`).

### Full mode (event-day variant)

If the spec says "each node's own cost counted once, no flow weighting":

```bash
ML_COST_FLOW=full  # or environment variable in docker-compose.yml
```

Implementation: `backend/app/content.py:25-35` (`_attribute_full`). Verified by `backend/tests/test_spec.py:33-39` (`test_cost_flow_full_sanity`).

### Edge cases the code handles

| Edge case | Behavior | Source |
|---|---|---|
| `total == 0` | Designation forced to NONE | `content.py:102` |
| `last_st_in_ca == False` | Designation forced to NONE (even if 100% CA cost) | `content.py:102` |
| All cost fields zero | `total=0` → NONE | `content.py:102` |
| Producer with `output.quantity == 0` | `frac` becomes `0.0`, flow doesn't propagate; node contributes 0 if root, else only via its own flow | `content.py:57` |
| Invalid node (status != OK) | Excluded from `valid` set → contributes 0 to all sums | `verify.py:93` |
| Mass-balance hit anywhere | Designation forced to NONE regardless of pct | `verify.py:109-113` |
| Root invalid | Designation forced to NONE regardless of pct | `verify.py:109-113` |
| Double-counting in DAGs with sharing | Avoided by consumption-fraction weighting — a node's flow is summed across all its consumers' flows | `content.py:50-58` |

### Per-node subtree percent (display only)

`content.subtree_percents(chain, valid)` produces `{hash: float}` where each value is the CA % across the de-duplicated input-closure of that node. Display-only; never feeds the verdict. For a full-consumption chain, the root's `subtree_percent` equals `canadian_pct` (asserted by `test_subtree_percent_root_matches_chain_pct`, `backend/tests/test_verify.py:119-125`).

---

## 10. Anomaly detection

Two strict categories. The verifier guarantees that **advisory anomalies cannot change the designation**.

### 10.1 Hard failures (set `Node.status = INVALID`)

| Code | Trigger | Source |
|---|---|---|
| `MALFORMED` | jsonschema validation failed at `POST /attestations` | `adapters.py:73-82`, `main.py:55` |
| `SIGNATURE_INVALID` | Ed25519 verify on canonical bytes failed | `verify.py:52-56` |
| `UNKNOWN_ISSUER` | `supplier_id` missing from registry OR `verified=False` | `verify.py:45-49` |
| `REPLAY_DETECTED` | `(supplier_id, output.product_id)` duplicate within scoped chain | `verify.py:58-63` |
| `BROKEN_LINK` | Input hash absent from scoped chain OR duplicate input reference | `verify.py:65-74` |
| `CYCLE` | DAG isn't acyclic → chain-fatal, returns NONE immediately | `chain.py:34-53`, `verify.py:33-37` |
| `MASS_BALANCE` | `Σ quantity_used by consumers > output.quantity` for any producer → forces NONE | `massbalance.py`, `verify.py:88-90,111` |

Mapping to the template's names you may have seen:

| Template name | Actual code |
|---|---|
| `SIGNATURE_MISMATCH` | `SIGNATURE_INVALID` |
| `UNKNOWN_SUPPLIER` | `UNKNOWN_ISSUER` |
| `MISSING_REFERENCE` | `BROKEN_LINK` (missing variant) |
| `QUANTITY_OVERUSE` | `MASS_BALANCE` |
| `NEGATIVE_COST` | Caught by JSON Schema (`minimum: 0`) → `MALFORMED` |
| `ZERO_TOTAL_COST` | Not a code; `total == 0` returns Designation.NONE |
| `BROKEN_HASH` | Caught implicitly: tampering changes the hash, so `attestation_id` doesn't match; or `SIGNATURE_INVALID` if the wire dict is altered post-signing |

### 10.2 Advisory (`advisory=True`, never invalidates)

| Code | Trigger | Source |
|---|---|---|
| `TEMPORAL_INVERSION` | Consumer timestamp earlier than an input's timestamp | `verify.py:77-85` |
| `ANOMALY` | IsolationForest score ≥ 0.6 AND `predict==-1` | `anomaly.py:80-135` |

Criticality is also advisory (writes to `Node.annotations["criticality"]`), but it doesn't emit `Anomaly` records — it's an overlay for the UI. Source: `criticality.py`.

### 10.3 ML model details

```python
# backend/app/anomaly.py

# Feature vector per node
features = (
    labour_cents / quantity,
    materials_cents / quantity,
    labour_cents / (materials_cents + 1),       # +1 to avoid div-by-zero
)

# Model
IsolationForest(n_estimators=100, contamination="auto", random_state=0)

# Decision
is_outlier = model.predict(matrix) == -1
score      = normalized -decision_function (0..1)
flag       = is_outlier AND score >= 0.6
```

- For `n < 2` nodes: returns `[]` (nothing to compare against).
- For `n < 3` nodes: z-score fallback with `|z| >= 3` gate.
- Training: **online per request**. There is no persisted model; the forest is fit on the nodes of the current verification, then thrown away. This is intentional — it makes "is this node weird relative to its peers in this chain?" a per-chain question.

### 10.4 What's NOT implemented (yet)

- `LABOUR_COST_OUTLIER`, `UNUSUAL_SUPPLIER_PATTERN`, `SUSPICIOUS_TIMING`, `HIGH_FOREIGN_DEPENDENCY`, `MISSING_OPTIONAL_EVIDENCE` from the template — none of these are wired. IsolationForest covers a *generic* cost-shape outlier, not these specifics.
- Persistent supplier-baseline (e.g., "this supplier's labour cost is unusual vs their history") — would need persistent storage first.
- Anomaly explanations beyond the most-deviant feature name and z-score (`anomaly.py:120-126`).

---

## 11. API documentation

> Base URL: `http://localhost:8000` (Docker) or `http://127.0.0.1:8000` (local).
> OpenAPI auto-docs: `http://localhost:8000/docs` (Swagger UI), `/redoc` (ReDoc).

### `GET /health`

**Purpose:** Liveness probe (used by Docker healthcheck).

```bash
curl http://localhost:8000/health
# → {"status":"ok"}
```

Returns: `200 {"status":"ok"}` always.

---

### `POST /attestations`

**Purpose:** Submit a signed attestation. Returns its content hash.

```bash
curl -X POST http://localhost:8000/attestations \
  -H 'content-type: application/json' \
  -d '{
    "supplier_id": "SUP-ALU",
    "output": {"product_id":"raw_aluminum","quantity":1,"unit":"kg"},
    "inputs": [],
    "materials_cents": 500,
    "labour_cents": 200,
    "work_country": "CA",
    "is_substantial_transformation": false,
    "timestamp": "2026-05-01T08:00:00Z",
    "signature": "<base64 Ed25519>"
  }'
# 200 → {"hash":"cb02d68739bf250608d06276833f7a1ca995d6ef95c1c2c58d456fba0cb59db1"}
```

| Status | When |
|---|---|
| 200 | Validation passed; stored. Body = `{"hash": "<64hex>"}` |
| 400 | `MALFORMED: <jsonschema-message>` |
| 500 | Unexpected internal error |

Note: the backend does **not** verify the signature here. Verification happens at `/verify`. This is intentional — `/attestations` accepts even an invalid-signature record so that the failure case is visible at `/verify` (`backend/app/main.py:52-60`).

---

### `GET /verify/{root_hash}`

**Purpose:** Run the verification pipeline for the product whose finished-good attestation has the given content hash.

```bash
curl http://localhost:8000/verify/13e72f89a1397084868ee6aaf006d47e2832b6f1c60b14c8279ff11207e77ef5
```

Response shape (locked — every test asserts this set of keys):

```json
{
  "designation": "MADE_IN_CANADA",
  "canadian_pct": 0.966,
  "total_cost_cents": 1470,
  "canadian_cost_cents": 1420,
  "cost_by_country": {"CA": 1420, "CN": 50},
  "anomalies": [],
  "graph": {
    "nodes": [
      {
        "id": "<hash>",
        "label": "drone_X1\nSUP-DRONE · CA",
        "supplier_id": "SUP-DRONE",
        "product_id": "drone_X1",
        "country": "CA",
        "status": "OK",
        "reason": null,
        "subtree_percent": 0.966,
        "contribution_cents": 420,
        "criticality": {"component_class": "critical", "value_add_pct": 0.9524}
      }
    ],
    "edges": [{"source": "<input-hash>", "target": "<consumer-hash>"}]
  }
}
```

- `designation`: `PRODUCT_OF_CANADA | MADE_IN_CANADA | NONE`.
- An unknown / missing root hash returns `Designation.NONE` with empty cost numbers (not a 404).
- The verdict is `NONE` if any of: root attestation invalid, any `MASS_BALANCE` hit, `total_cost_cents == 0`, last ST not in CA.

---

### `GET /registry`

**Purpose:** Read-only dump of the trusted supplier registry (public keys + verified flags). The system signs nothing here.

```bash
curl http://localhost:8000/registry
```

```json
{
  "SUP-ALU":   {"public_key": "6509beb7…f02bcc", "verified": true},
  "SUP-BEAR":  {"public_key": "5b19234a…871af",  "verified": true},
  "SUP-MOTOR": {"public_key": "049d9db4…f4da3",  "verified": true},
  "SUP-DRONE": {"public_key": "7951412b…0979c4", "verified": true}
}
```

---

### `POST /draft`  (LLM, advisory)

**Purpose:** Convert a plain-English description of one production step into a draft attestation. Human must review and sign — the model never signs and never decides verdicts.

```bash
curl -X POST http://localhost:8000/draft \
  -H 'content-type: application/json' \
  -d '{"text": "We CNC-milled 50 airframes in Ontario from Canadian 6061 billet; 3 machinists × 6 hrs @ $42/hr."}'
```

Response (success):

```json
{
  "draft": {
    "supplier_id": "SUP-…",
    "output": {"product_id": "airframe", "quantity": 50, "unit": "pcs"},
    "inputs": [],
    "materials_cents": 12000,
    "labour_cents": 75600,
    "work_country": "CA",
    "is_substantial_transformation": true,
    "timestamp": "2026-05-30T00:00:00Z"
  },
  "valid": true,
  "notes": "Schema-valid draft — review every field before signing."
}
```

| Status | When |
|---|---|
| 200 | Draft produced (may still be schema-invalid; check `valid` and `notes`) |
| 400 | Missing `text` field |
| 502 | LLM call failed |
| 503 | `ANTHROPIC_API_KEY` not set |

---

### `POST /ask`  (LLM, advisory)

**Purpose:** Natural-language Q&A over the verified result. The LLM only re-frames deterministic facts; every number comes from `/verify`, never from the model.

```bash
curl -X POST http://localhost:8000/ask \
  -H 'content-type: application/json' \
  -d '{"question": "Which inputs are foreign?", "root_hash": "13e72f89…77ef5"}'
```

Response:

```json
{
  "answer": "The steel bearings (SUP-BEAR) are from China; everything else is Canadian.",
  "citations": ["b738ffd09ca2675ad06a8de900399f789ca4c2a3c70d8dabcf10ed7f2878187f"]
}
```

Citations are **filtered** against the set of node ids in the deterministic graph — invented hashes are stripped.

| Status | When |
|---|---|
| 200 | Answer produced |
| 400 | Missing `question` or `root_hash` |
| 502 | LLM call failed |
| 503 | `ANTHROPIC_API_KEY` not set |

---

## 12. Demo walkthrough

### Setup

```bash
docker compose up --build       # in one terminal
python scripts/seed.py          # in another (loads all 11 fixtures)
```

The `seed.py` output prints each fixture's root hash and what it demonstrates.

### Demo 1 — Happy path (Made in Canada)

```text
1. Open http://localhost:5173/?mock=0
2. Click "Manual hash" → paste happy_path.json's root_hash
3. Click Verify.
4. Result:
     - Big emerald badge: MADE IN CANADA
     - Canadian content: 96.6%
     - Cost-by-country bar: CA 1420¢ / CN 50¢
     - Provenance graph: 4 nodes, 3 edges, all green except BEAR (grey, foreign)
     - No integrity issues
5. Click "View calculation details" → pie + per-component contribution bars
6. Click any critical node in the criticality panel to see value-add %
```

### Demo 2 — Tampered attestation

```text
1. Paste tampered.json's root_hash.
2. Result:
     - Red badge: NOT QUALIFIED
     - Big red "Integrity check" card with SIGNATURE_INVALID
     - DRONE node in the graph is red-bordered
     - cost_by_country still computed over surviving nodes (showing the
       degrade-gracefully behavior)
```

How it was constructed (`data/tools/gen_mock.py:114-117`): take the happy-path drone attestation, change `materials_cents` from 20 → 99999, recompute the hash (`rehash(drone_t)`). Wire body now hashes to a new root, but the signature was computed over the *original* canonical bytes — so verification fails.

### Demo 3 — Mass-balance attack (quantity overuse)

```text
1. Paste overdraw.json's root_hash.
2. Result:
     - Red badge: NOT QUALIFIED
     - MASS_BALANCE anomaly with detail "consumed 5 > produced 1"
     - MOTOR node is the failed one (it consumed 5 bearings; only 1 was produced)
```

### Demo 4 — Foreign assembly (≥98% CA cost but last ST in China)

```text
1. Paste foreign_assembly.json's root_hash.
2. Result:
     - Red badge: NOT QUALIFIED  (despite very high CA cost %)
     - This is the two-condition rule in action: cost passes, ST location fails.
```

### Demo 5 — Author your own attestation (supplier UI)

```text
1. Open http://localhost:5174
2. In "Demo tools" → "Load demo identity" → pick SUP-DRONE.
   (Loads the matching private key so the signature is registry-recognized.)
3. Fill or accept the default form (raw_aluminum 1kg CA, $5 materials + $2 labour).
4. Click Review & sign → confirm → Sign & submit.
5. Backend returns a hash. Paste that hash into the purchaser UI to verify the
   single-node chain.
```

### Demo 6 — AI authoring (requires ANTHROPIC_API_KEY)

```text
1. In the supplier UI's "Demo tools" panel, type a plain-English description into
   "Draft with AI", e.g.:
     "We milled 10 widgets in Ontario; 2 workers × 4 hrs @ $30/hr; Canadian steel."
2. Click "Draft with AI".
3. The form auto-fills with the LLM's draft; review every field before signing.
```

### Demo 7 — Natural-language Q&A (purchaser UI, live mode only)

```text
1. After a successful verification, scroll to "Ask about this product".
2. Try: "Which inputs come from outside Canada?" or "How was the Canadian
   percentage calculated?"
3. Answer appears with citations (first 10 chars of relevant node hashes).
```

### Fixtures summary

| Fixture | Demonstrates | Expected designation | Expected reason |
|---|---|---|---|
| `happy_path.json` | clean MADE_IN_CANADA | MADE_IN_CANADA | — |
| `product_of_canada.json` | all-CA ≥98% | PRODUCT_OF_CANADA | — |
| `foreign_assembly.json` | ≥98% CA cost but last ST in CN | NONE | — |
| `tampered.json` | field edited after signing | NONE | SIGNATURE_INVALID |
| `unknown_issuer.json` | signed by unregistered key | NONE | UNKNOWN_ISSUER |
| `broken_link.json` | input hash doesn't exist | NONE | BROKEN_LINK |
| `overdraw.json` | consumes more than upstream produced | NONE | MASS_BALANCE |
| `duplicate_input.json` | same input referenced twice | NONE | BROKEN_LINK |
| `replay.json` | two attestations share `(issuer, output serial)` | PRODUCT_OF_CANADA | REPLAY_DETECTED |
| `temporal.json` | input dated AFTER consumer | PRODUCT_OF_CANADA | TEMPORAL_INVERSION |
| `anomaly.json` | valid signature but ~5× labour cost | PRODUCT_OF_CANADA | ANOMALY |

---

## 13. Tests

### Run

```bash
cd backend && python -m pytest -q                   # unit suite (38 tests)
python scripts/selftest.py                          # unit + (if backend up) live HTTP
python scripts/e2e_check.py                         # live HTTP only (requires running backend)
```

### Test files and coverage

| File | Tests | What it locks |
|---|---|---|
| `backend/tests/test_smoke.py` | 5 | App boots; `POST /attestations` returns matching hash; canonicalize+sign+verify byte-agreement; tampered signature fails; response keys locked (`{designation, canadian_pct, total_cost_cents, canadian_cost_cents, cost_by_country, anomalies, graph}`) |
| `backend/tests/test_verify.py` | 14 | Verdict + reason across all 11 fixtures + manual cycle + self-reference + subtree_percent root==chain pct + criticality overlay verdict unchanged + cross-chain contamination regression |
| `backend/tests/test_spec.py` | 7 | JCS default; DSSE PAE round-trip; COST_FLOW=full sanity; ST_STRATEGY=root; registry-list / nested / camelCase shapes |
| `backend/tests/test_anomaly.py` | 4 | Inflated-labour node flagged; clean run flags fewer; all anomalies are advisory + carry detail; small-input safety (0/1/2 nodes) |
| `backend/tests/test_robustness.py` | 5 | Empty store→NONE; missing root→NONE; malformed entry in store doesn't crash unrelated verify; schema rejects missing required field; schema tolerates additive fields |
| `backend/tests/test_ai.py` | 3 | 503 without key for `/draft` and `/ask`; 400 missing text |
| **Total** | **38** | |

### What's not currently tested

- `GET /registry` route is not exercised by tests (only used by UIs).
- `/ask` happy path requires a real LLM key, so it's not tested with monkeypatch beyond 503 / 400.
- `content._attribute_full` is exercised via `attribute_costs` indirectly; no dedicated test of its by-country breakdown.
- No frontend tests (other than `canonical.test.js` for byte-parity).
- No tests for `criticality.classify` directly — only that it doesn't change the verdict.
- No load / concurrency tests.

### Minimum-required-tests checklist

| Test from template | Covered? | Where |
|---|---|---|
| Valid Product of Canada | YES | `test_product_of_canada` |
| Valid Made in Canada | YES | `test_happy_path` |
| Under 51% Canadian | Implied by `cost_by_country` math; no dedicated fixture | — |
| Final transformation outside Canada | YES | `test_foreign_assembly_fails_on_last_st` |
| Tampered attestation | YES | `test_tampered_signature` |
| Unknown supplier | YES | `test_unknown_issuer` |
| Missing reference | YES | `test_broken_link` |
| Cycle in graph | YES | `test_cycle_guard`, `test_self_reference_is_cycle` |
| Quantity overuse | YES | `test_overdraw_mass_balance` |
| Negative cost | YES (rejected at schema layer → `test_validate_rejects_missing_required_field` pattern; `minimum: 0` in schema) | `schema/attestation.schema.json:42-43` |
| Malformed JSON | YES | `test_validate_rejects_missing_required_field` |
| Deep graph | No (largest fixture is 4 nodes) | — |

---

## 14. Known limitations

### Mocked or hardcoded

- **Supplier registry** is a static JSON file (`data/registry.json`) with 4 mock suppliers (`SUP-ALU`, `SUP-BEAR`, `SUP-MOTOR`, `SUP-DRONE`). No real accreditation flow.
- **Demo private keys** are shipped in source: `frontend/supplier/src/devIdentities.js`. Derived deterministically from `sha256("maple-ledger-mock-v1::" + supplier_id)` (`data/tools/gen_mock.py:32-39`). DEV ONLY.
- **Mock-data mode** is the default for the purchaser UI. Without `?mock=0`, the page returns the same canned `mockVerificationResult` for any input.
- **Timestamps in fixtures** are hardcoded (`2026-05-01`/`02`/`03` for the four mock suppliers).

### Insecure / demo-only

- **CORS is fully open** (`allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`). Acceptable for a hackathon LAN demo; not for any public deployment.
- **No authentication** on any route. Anyone who can reach the backend can submit attestations or call `/draft`/`/ask`.
- **No rate limiting** on `/draft` / `/ask` — easy way to burn an API key.
- **`/attestations` doesn't verify the signature** at submit time. Verification only happens at `/verify`. (Intentional, so that `SIGNATURE_INVALID` is observable in the verifier flow.)
- **No request size limits** beyond FastAPI defaults.

### Breaks with scale

- **In-memory `STORE: dict`** — restart wipes everything. Memory grows unbounded over the process lifetime.
- **`content.subtree_percents` is O(V·(V+E))** — fine for hackathon-scale chains (<100 nodes), would need memoization for thousands.
- **IsolationForest fit per request** — re-fits the model on every `/verify`. Constant time at our scale; would dominate latency at production scale.
- **Single uvicorn worker** in the Dockerfile (default). `--workers > 1` would silo `STORE` per worker.

### Edge cases not handled

- **Cycle anomaly carries no per-node detail.** Only `root_hash` is referenced; you can't see which nodes form the cycle.
- **REPLAY key is `(supplier_id, output.product_id)` only.** Two distinct production runs of the same product by the same supplier collide. Real spec may need timestamps or lot ids.
- **Schema is permissive at the backend** (`additionalProperties: true`). A typo in a field name passes validation silently.
- **The supplier-UI schema doesn't have a `format: date-time` enforcer beyond a regex.** Day-of more rigorous timestamp parsing may be needed.
- **No retry/backoff** in `llm.py` for 429/5xx from Anthropic.
- **`_st_by_activity` reads `node.annotations["activity"]`** which no current code populates. Day-of `attestation_from_dict` is expected to write it.

### What needs refactoring (low priority for the hackathon)

- `Reason` enum order in `models.py` lists `SIGNATURE_INVALID` before `UNKNOWN_ISSUER`, but the runtime order in `verify.py` is reversed (UNKNOWN_ISSUER first, because you need the key to verify). Two sources of truth.
- Lazy `from . import anomaly` inside a try/except in `verify.py:116-120` is labeled "lit up once anomaly.py merges" — comment is stale; it has merged and can be a top-level import.
- `gen_mock.py` has a redundant `import hashlib` inside `rehash()`.
- `e2e_check.py` hard-codes the expected results table — would be better to read each fixture's `expected` block.

---

## 15. Roadmap / where to add value

### If you have 2 hours

| Task | Why | Where |
|---|---|---|
| Add a `?mock=0` indicator that always shows on the purchaser UI when in mock mode | Prevents demo confusion ("the page shows the same result for any hash") | `frontend/purchaser/src/App.jsx` (the `ModeBadge` already exists; promote it visually) |
| Add `expected` assertion in `e2e_check.py` that reads each fixture's `expected` field instead of hardcoding | Single source of truth | `scripts/e2e_check.py:38-50` |
| Add a "Cycle members" detail to the cycle anomaly | Better debug message | `backend/app/verify.py:33-37` (capture which hashes weren't in `order`) |
| Write a `test_content.py` covering `_attribute_full` end-to-end | Coverage gap | `backend/tests/test_content.py` (new) |
| Add a frontend test for `lib/validate.js` | Coverage gap | `frontend/supplier/src/lib/validate.test.js` (new) |

### If you have 1 day

| Task | Why | Where |
|---|---|---|
| **"Red Team This Claim" mode** | The single highest-impact demo add-on. Inline buttons on the purchaser UI: "Tamper this attestation" / "Inflate labour cost" / "Replay this input" → re-run verify → show the matching reason code lighting up. | New component in `frontend/purchaser/src/components/` + small POST helpers |
| Persist `STORE` to SQLite | Survives restart; matches the design doc's later plan | `backend/app/storage.py` (new), `backend/app/main.py` |
| Deeper graph fixtures (10+ nodes, shared inputs) | Stress the consumption-fraction math | `data/tools/gen_mock.py` + new fixture |
| Implement `LABOUR_COST_OUTLIER` as a deterministic rule alongside `IsolationForest` | Auditor-friendly explanation | `backend/app/anomaly.py` (new rule, advisory) |
| Add per-anomaly "why this matters" copy in the purchaser UI | Judges understand fast | `frontend/purchaser/src/labels.js` (`ANOMALY_FALLBACK_DETAIL`) |

### If you have a week

| Task | Why |
|---|---|
| Real supplier registry (multi-shape loader is ready; add a `verified_at` / `accreditation_id` field) | Production-realism |
| Transparency log (append-only, hash-chained) | Defensible "tamper after the fact" story |
| Persistent supplier-baseline anomaly detection (this supplier vs their history) | Real-world fraud signal |
| Better graph layout (force-directed) with cost-flow edge widths | Visual pitch clarity |
| End-to-end Playwright tests for both UIs | Catch regressions in the demo flow |
| Internationalization (en/fr) of the UI copy | Federal-Canada credibility |

### Hidden-scoring guesses (prioritize these)

The build plan emphasizes that the scoring harness will test specific behaviors. High-likelihood hidden tests:

- Signature verification with the *real* event-day reference library — handled by `adapters.verify` swap.
- Cost-flow math under fractional consumption (e.g., `quantity_used=0.42` of `quantity=1`). Current code uses integer `quantity_used` per the internal model; **this is one to double-check at kickoff** — see `adapters.attestation_from_dict:53-69` where the coercion happens.
- Mass-balance with shared raw-material lots across multiple finished goods. The scope-by-reachable logic (`verify.py:138-148`) is the defense.
- Deep chains (>10 levels) — performance and correctness of the topo walk.
- Mixed-validity chains (some nodes invalid, some valid) — already covered.

---

## 16. Security notes

### Keys

- **Algorithm:** Ed25519 throughout. Backend uses `cryptography.hazmat.primitives.asymmetric.ed25519`. Browser uses `@noble/ed25519` 3.x (which requires `ed.hashes.sha512 = sha512` injection — done in `crypto.js:11`).
- **Mock supplier private seeds** (32 bytes each, hex-encoded) are deterministically derived from `sha256("maple-ledger-mock-v1::" + supplier_id)` in `data/tools/gen_mock.py:32-39`. They are:
  - Shipped in `frontend/supplier/src/devIdentities.js` (committed, DEV ONLY).
  - Also written to `data/dev/dev_keys.json` (gitignored).
- **Real signers** would hold their own private key off-system. The backend never sees a private key.
- **No HSM, no YubiKey, no DID** support.

### Signatures

- `signature = base64(Ed25519_sign(privateKey, canonicalize(payload_dict(att))))`.
- `payload_dict` excludes the `signature` field — only the body bytes are signed.
- Verification: `Ed25519PublicKey.verify(signature_bytes, message_bytes)`, returns boolean via try/except `InvalidSignature` (`adapters.verify`).
- **One tamper → two independent detections:**
  1. Hash changes → input references dangle → `BROKEN_LINK` upstream.
  2. Signature fails to verify against the original message → `SIGNATURE_INVALID` on the tampered node.

### Canonicalization

- **RFC-8785-style JCS** (sorted keys recursively, compact separators, UTF-8, no insignificant whitespace).
- **Python:** `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")` (`adapters.py:85-89`).
- **JavaScript:** hand-rolled recursive serializer (`frontend/supplier/src/lib/canonical.js`).
- **Byte-parity is a critical assumption.** Guarded by `runCanonicalSelfTest()` in `frontend/supplier/src/lib/canonical.test.js`, which:
  - Runs on supplier-UI page load (logs result; shows PASS/FAIL header badge).
  - Runs as `node src/lib/canonical.test.js` (exits non-zero on failure).
- **DSSE variant** (`spec.SERIALIZATION = "dsse"`) wraps the JCS body in DSSE Pre-Authentication Encoding (`adapters._pae`) — event-day-swap-ready.

### Can a user edit signed data?

No — modifying any field changes the canonical bytes, which (a) changes the content hash (so the modified body no longer matches what was stored or referenced), and (b) invalidates the signature (since it was computed over the original bytes).

### Can someone bypass the backend?

- Yes, technically: anyone who can reach `POST /attestations` can submit any wire dict. But it can't pass `/verify` unless the signature is valid against a registry-verified key.
- The supplier UI is convenience-only — there's no client-side gate that the backend depends on.
- The advisory `/ask` and `/draft` endpoints have no auth — anyone who can reach them can use the API key.

### Safe-for-demo vs production must-fix

| Issue | Demo OK? | Must change for production |
|---|---|---|
| CORS `*` | Yes | Restrict to known origins |
| Plaintext private seeds in `devIdentities.js` | Yes | Remove entirely; use HSM-backed or local keystore |
| In-memory `STORE` | Yes | SQLite or Postgres |
| No auth on `/draft` /`/ask` | Yes | API key or session auth |
| No rate limiting | Yes | Per-IP or per-key throttling |
| `additionalProperties: true` in backend schema | Yes (forward-compat) | Tighten once spec is final |
| `data/dev/dev_keys.json` written by `gen_mock.py` | Yes (gitignored) | Don't generate; require real key registration |

---

## 17. Environment variables

### Root `.env` (for Docker Compose)

Template at `.env.example`. All variables are **optional** — defaults preserve current mock behaviour.

| Variable | Default | Effect | Read by |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | (unset) | Enables `/draft` and `/ask`. Absent → both return 503. | `backend/app/llm.py:30` |
| `ML_CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Model id sent to Anthropic API | `backend/app/llm.py:26` |
| `ML_SERIALIZATION` | `jcs` | `jcs` (RFC-8785-style) or `dsse` (PAE wrapper over JCS body) | `backend/app/spec.py:20`, used in `adapters.canonicalize` |
| `ML_DSSE_PAYLOAD_TYPE` | `application/vnd.maple-attestation+json` | Payload-type string inside the DSSE envelope | `backend/app/spec.py:21-23` |
| `ML_ST_STRATEGY` | `flag` | Which strategy `find_last_st` uses: `flag` (nearest-to-root flagged), `root` (always root), `activity` (nearest with `annotations["activity"] in ST_ACTIVITIES`) | `backend/app/spec.py:29` |
| `ML_COST_FLOW` | `fraction` | `fraction` (consumption-weighted DAG) or `full` (each node's own cost counted once) | `backend/app/spec.py:35` |

These six variables are forwarded into the `verifier-backend` container by `docker-compose.yml:10-17`.

### `backend/.env` (for local non-Docker dev)

Loaded automatically by `backend/app/llm.py` if present (line-by-line, supports quoted values, ignores `#` lines). Same variable names as above.

### Frontend `.env` files

| Variable | Default | Effect | Read by |
|---|---|---|---|
| `VITE_BACKEND_URL` | `http://localhost:8000` | Backend base URL (no trailing slash) | `frontend/*/src/config.js`, `frontend/*/lib/api.js` |
| `VITE_USE_MOCK` | `true` (purchaser only) | Force mock data instead of live backend; `?mock=0` URL param wins | `frontend/purchaser/src/config.js` |

Example: `frontend/purchaser/.env.local`:

```text
VITE_BACKEND_URL=http://localhost:8000
VITE_USE_MOCK=false
```

---

## 18. Adapter-swap matrix (event-day playbook)

The single biggest design bet: **everything spec-uncertain is isolated behind 6 adapter functions + 1 env-driven module.** On event day, you flip constants and rewrite *only* the bodies of the 6 adapters — nothing above the adapter line moves.

### The 6 seams (in `backend/app/adapters.py`)

| Function | Mock behavior | Day-of swap |
|---|---|---|
| `validate(obj) → (bool, str|None)` | jsonschema against `schema/attestation.schema.json` | Point to the real schema; logic unchanged |
| `canonicalize(obj) → bytes` | JCS (default) or DSSE-PAE (env-selectable) | Confirm which the spec uses; both variants already coded |
| `verify(message, signature, public_key) → bool` | `pyca/cryptography` Ed25519 | Swap to the provided reference library if different |
| `resolve_key(supplier_id, registry) → (Ed25519PublicKey|None, bool)` | dict lookup; multi-shape registry handled in `registry._normalize` | If the real registry has a different shape, extend `_normalize` |
| `get_costs(att) → (materials_cents, labour_cents, work_country)` | Direct field reads | If the real spec splits CA/foreign cost or uses decimal dollars, this is the only place to translate |
| `find_last_st(chain) → Node | None` | One of 3 strategies (env-selectable) | If the real ST rule is none of these, write a 4th and dispatch in `_ST_STRATEGIES` |

### The 4 event-day unknowns and how each is absorbed

| Unknown | Variants pre-staged | Switch mechanism |
|---|---|---|
| **Canonical serialization** | JCS (default) / DSSE PAE | `ML_SERIALIZATION=dsse` in env or `docker-compose.yml` |
| **Substantial-transformation rule** | flag / root / activity | `ML_ST_STRATEGY=root` or `=activity` (+ populate `annotations["activity"]` from real attestation field in `attestation_from_dict`) |
| **Cost-flow / partial-consumption** | fraction (DAG weighting) / full (own cost once) | `ML_COST_FLOW=full` |
| **Registry shape** | dict / list / `{issuers: …}` / camelCase keys | Auto-detected by `registry._normalize` (`backend/app/registry.py:16-37`) |

### Kickoff sequence (per `developing/kickoff-checklist.md`)

1. Read the event-day spec.
2. Flip the matching `ML_*` constant(s) — or set env var(s) in compose.
3. Rewrite **only** the bodies of `attestation_from_dict` and `get_costs` to map real field names → internal model.
4. Run `python scripts/run_chain.py <provided_chain.json>` to verify the pipeline still flows.
5. Run `python scripts/selftest.py` — should still pass.
6. Run the official scoring harness.

### What must NOT change at kickoff

- `models.py` types (the frozen contract).
- Any signature of any function in `adapters.py` (only bodies).
- The route shapes in `main.py`.
- The verifier precedence order in `verify.py`.

---

## 19. The 7 things you must understand before adding features

> If you understand these, you can add real value safely.

1. **How an attestation is created.**
   Supplier UI: form → `buildPayload(form)` (numbers coerced, country uppercased, hash lowercased) → `validatePayload` (hand-rolled mirror of the schema) → `canonicalize` (JS JCS) → `signPayload` (Ed25519 over canonical bytes, base64) → `submitAttestation` (POST). Source: `frontend/supplier/src/App.jsx`.

2. **How an attestation is signed.**
   The signed bytes are **`canonicalize(payload_dict(attestation))`** — the wire object minus its `signature` field, with keys recursively sorted, compact separators, UTF-8. Ed25519 hashes its own message (SHA-512), so don't pre-hash. The browser uses `@noble/ed25519`; the backend uses `pyca/cryptography`. Byte-parity is enforced by the canonical self-test. Source: `backend/app/adapters.py:27-50,99-117`, `frontend/supplier/src/lib/crypto.js`.

3. **How the hash is generated.**
   `attestation_id = sha256(canonicalize(payload_dict(att))).hexdigest()` → 64-char lowercase hex. Source: `backend/app/adapters.py:48-50`. The hash is **also** the storage key in `STORE` and the value referenced by downstream `InputRef.attestation_hash`.

4. **How attestations are linked into a graph.**
   `build_chain(attestations, root_hash)`: first pass populates `by_hash: dict[str, Node]` (Node.`input_hashes` from each attestation's `InputRef`s). Second pass walks every node's `input_hashes` and appends to the producer's `consumer_hashes`. A reference to a hash that isn't in `by_hash` is *representable* — it becomes a `BROKEN_LINK` at verify time, not a crash. Source: `backend/app/chain.py:56-69`.

5. **How the verifier walks the graph.**
   `verify_root` scopes the store by `reachable()` from the root, then re-builds the chain on that scope. `Verifier.verify` runs `topo_walk` (Kahn) — cycle is fatal. Per-node precedence: `UNKNOWN_ISSUER → SIGNATURE_INVALID → REPLAY_DETECTED → BROKEN_LINK`, first match wins. After that: temporal monotonicity (advisory), mass-balance (hard), cost attribution, designation, forced NONE overrides, advisory ML. Source: `backend/app/verify.py:29-125`.

6. **How Canadian percentage is calculated.**
   Default fraction mode: `flow(root)=1`; flow propagates root-first along each input edge weighted by `quantity_used/produced`. Each valid node contributes `round(own_cost × flow)`. Designation uses **integer cross-multiplication** (`canadian * 100 >= 98 * total`) — never float division. Source: `backend/app/content.py:38-108`.

7. **How anomalies are detected and returned.**
   Hard failures are emitted inside the precedence loop (`fail(node, reason)` sets `node.status = INVALID` and appends `Anomaly(reason, ..., advisory=False)`). Advisory items (`TEMPORAL_INVERSION`, `ANOMALY`) are appended separately and have `advisory=True`. The anomaly list is the third arg of `VerificationResult`; the API returns it as `anomalies[].{reason, attestation_hash, detail, advisory}`. **Advisory anomalies cannot change the designation.** Source: `backend/app/verify.py`, `backend/app/anomaly.py`.

---

## 20. Highest-impact add-ons

| Add-on | Why it helps | Effort |
|---|---|---|
| **"Red Team This Claim" mode** | Turns the project from "a verifier" into "a fraud-resistant verifier." Inline buttons on the purchaser UI: tamper a field, replay an input, drop a reference → re-verify → watch the matching reason light up. The team's own demo script (`developing/demo-script.md`) calls for this. | 1 day |
| Better graph visualization (force-directed layout, edge widths = cost flow) | Judges grasp provenance immediately | Half day |
| Per-anomaly "what this means for you" copy | Already half-built (`ANOMALY_FALLBACK_DETAIL` in `labels.js`) — extend with action recommendations | 2 hours |
| Anomaly explanations (which feature was outlier, by how much) | `anomaly.py` already includes feature name + z-score; surface this in the UI | 1 hour |
| Deeper test suite (10+ node chains, shared raw-material lots, mixed validity) | Hidden scoring loves edge cases | 1 day |
| Persistent SQLite store | Survives restart; matches the design doc's planned upgrade | Half day |
| Demo script with timing notes | Smoother pitch | 1 hour |
| Edge-case handling improvements (cycle members enumerated, more `TEMPORAL_INVERSION` context) | Prevents hidden test failures | 2 hours |

### Pick one: the strongest add-on

**Red Team This Claim mode** is the single highest-impact addition. Here's the rough shape:

1. After a successful verification in the purchaser UI, add a "Red Team" panel.
2. For each node in the graph, offer buttons: "Inflate labour cost", "Replay this input", "Forge signature", "Drop a reference".
3. Each button mutates the stored attestation client-side, re-POSTs it (overwriting in `STORE` by new hash), and re-runs `/verify` on a re-pointed root.
4. The UI shows a before/after split: original verdict (green) → tampered verdict (red, with the matching reason code in the anomaly card).
5. Pitch line: "Every defensive check has a corresponding attack we can demonstrate live."

This turns the existing 11 fixtures (which already cover each attack class) into an interactive feature, requires only frontend work, and lands on the team's strongest narrative.

---

## Appendix A — File reference card

Quick lookups when you need to find something:

| You want to… | Look at… |
|---|---|
| Add a new route | `backend/app/main.py` |
| Change how attestations are validated | `backend/app/adapters.py:73-82` + `schema/attestation.schema.json` |
| Change how signatures are verified | `backend/app/adapters.py:109-116` |
| Change canonicalization | `backend/app/adapters.py:99-106` (Python) + `frontend/supplier/src/lib/canonical.js` (JS) |
| Change cost math | `backend/app/content.py:16-69` |
| Add a new reason code | `backend/app/models.py:47-56` (enum) + `backend/app/verify.py` (emit) + `frontend/purchaser/src/labels.js` (display copy) |
| Add a new advisory anomaly | `backend/app/anomaly.py` (or new module) + return list from `Verifier.verify` |
| Change the designation rules | `backend/app/content.py:101-108` |
| Change ST detection | `backend/app/adapters.py:133-183` + `backend/app/spec.py:29` |
| Add a fixture | `data/tools/gen_mock.py` → re-run `python data/tools/gen_mock.py` |
| Change the registry format | `backend/app/registry.py:16-37` (`_normalize`) |
| Wire a new env-driven variant | `backend/app/spec.py` + read from the consuming module |
| Change the purchaser UI verdict card | `frontend/purchaser/src/components/VerdictCard.jsx` |
| Change the provenance graph render | `frontend/purchaser/src/components/ProvenanceGraph.jsx` |
| Change the supplier form | `frontend/supplier/src/App.jsx` (`FormStep` component) |
| Tweak the LLM system prompts | `backend/app/main.py:94-103` (draft) and `backend/app/main.py:137-142` (ask) |

---

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| **Attestation** | A signed record of one supplier's contribution (`Attestation` dataclass). |
| **Attestation hash / content id** | `sha256(canonicalize(payload_dict(att))).hex()` — 64-char lowercase hex. The storage key. |
| **Root hash** | The attestation hash of the finished product (what's encoded in the QR). |
| **JCS** | JSON Canonicalization Scheme (RFC 8785). Sorted keys, compact separators, UTF-8. |
| **DSSE** | Dead-Simple Signing Envelope. We use its Pre-Authentication Encoding (PAE) over the JCS body when `ML_SERIALIZATION=dsse`. |
| **Substantial transformation** | A step that changes the form/nature of inputs (e.g., aluminum → motor housing). Required-in-Canada for any "Made in Canada" verdict. |
| **Value-add** | `labour / (materials + labour)`. Drives the criticality classification. |
| **Reachable scope** | The subgraph of attestations reachable from the queried root via input edges. Scoping is what prevents shared-lot overdraw false positives across products. |
| **Advisory** | An anomaly that records information without invalidating the chain or changing the designation (`advisory=True` on `Anomaly`). |
| **Adapter seam** | One of 6 functions in `adapters.py` that the event-day spec is allowed to touch. |
| **Variant selector** | An env var (`ML_*`) that flips between pre-staged adapter behaviors at startup. |

---

*Maintained alongside the code. Last update: 2026-05-30. When you change behavior, change this document.*
