# Maple Ledger — Implementation Record (pre-event)

> **As of 2026-05-29 (the evening before kickoff).** This documents everything that
> is built, tested, and deployed *before* the event-day spec drops. It is the
> companion to `02-event-day-swap-guide.md` (which lists what gets replaced on 30 May).
>
> Status: **all spec-independent scope complete.** 40 unit tests + 11 live e2e
> fixtures + the two AI endpoints pass on the deployed Docker stack.

---

## 1. System at a glance

A cryptographic-provenance verifier for Canadian supply chains, in three services
(`docker compose up --build`):

| Service | Port | Role |
|---|---|---|
| `verifier-backend` | 8000 | FastAPI HTTP API — the scored core |
| `purchaser-ui` | 5173 | React/Vite — scan/verify a product, see verdict + graph + breakdown |
| `supplier-ui` | 5174 | React/Vite — author, sign (Ed25519), submit an attestation |

**Stack:** Python 3.11 · FastAPI · `pyca/cryptography` (Ed25519) · `jsonschema` ·
`scikit-learn` (anomaly) · `httpx` (AI client). React + Vite + Tailwind +
Cytoscape.js · `@noble/ed25519` (browser signing).

**Run / test:**
```
docker compose up --build           # full stack
python scripts/selftest.py          # pytest (+ live e2e if backend up)
python scripts/seed.py              # load all fixtures into the running backend
python scripts/run_chain.py <file>  # verify any chain JSON (event-day harness)
```

---

## 2. Backend modules (`backend/app/`)

| File | Responsibility | Spec-dependent? |
|---|---|---|
| `main.py` | FastAPI app + 6 routes; in-memory attestation store; registry load on startup | routes locked; field handling via adapters |
| `models.py` | Frozen internal data model (`Attestation`, `Node`, `VerificationResult`, `Reason`, `Designation`) | **no** — the internal contract |
| `adapters.py` | **The 6 seams** + shared canonicalize/hash + wire↔internal mapping | **yes** — the only spec touch-point |
| `spec.py` | Event-day variant selector (serialization / ST rule / cost-flow) | **yes** — set on the day |
| `chain.py` | Build the DAG, bidirectional edges, Kahn topo-walk + cycle guard | no |
| `verify.py` | Precedence engine, structural + temporal checks, graph serialization, verdict assembly | no (consumes adapters) |
| `content.py` | Canadian-content math (cost attribution, subtree %, the 98/51 verdict) | weighting rule via `spec.COST_FLOW` |
| `massbalance.py` | Quantity-overdraw check | no |
| `anomaly.py` | Advisory `IsolationForest` cost-shape score (+ z-score fallback for tiny batches) | no |
| `criticality.py` | Advisory strategic-criticality overlay (critical/standard/commodity + value-add) | no |
| `registry.py` | Load registry → `{id: (pubkey, verified)}`; multi-shape normalizer | shape via `_normalize` |
| `llm.py` | Key-optional Anthropic client for the advisory AI features | no (advisory) |

### Verification pipeline (DESIGN §7), per node, first match wins
`MALFORMED → SIGNATURE_INVALID → UNKNOWN_ISSUER → REPLAY_DETECTED → BROKEN_LINK / CYCLE → MASS_BALANCE`,
then advisory `TEMPORAL_INVERSION` + `ANOMALY`. A failed node is excluded from the
cost sum (graceful degradation); `CYCLE`, `MASS_BALANCE`, or an invalid root force `None`.

### Canadian-content verdict (content.py, integer cents, cross-multiplication)
- `PRODUCT_OF_CANADA` ← Canadian ≥ 98% of total **AND** last substantial transformation in Canada.
- `MADE_IN_CANADA` ← Canadian ≥ 51% **AND** last substantial transformation in Canada.
- `NONE` otherwise.

---

## 3. API endpoints

| Method | Path | Body / param | Returns |
|---|---|---|---|
| GET | `/health` | — | `{"status":"ok"}` |
| POST | `/attestations` | attestation wire dict | `{"hash": "<sha256>"}` |
| GET | `/verify/{root_hash}` | path param | `VerificationResult` + `graph{nodes,edges}` |
| GET | `/registry` | — | `{id:{public_key,verified}}` (read-only trust anchor) |
| POST | `/draft` | `{text}` | `{draft, valid, notes}` — advisory AI authoring (503 if no key) |
| POST | `/ask` | `{question, root_hash}` | `{answer, citations}` — advisory NL verifier (503 if no key) |

`VerificationResult`: `designation`, `canadian_pct`, `total_cost_cents`,
`canadian_cost_cents`, `cost_by_country`, `anomalies[]`, `graph`.
Each graph node carries: `id, label, supplier_id, product_id, country, status,
reason, subtree_percent, contribution_cents, criticality`.

---

## 4. Data & tooling

| Path | What |
|---|---|
| `schema/attestation.schema.json` | Mock attestation schema (JSON Schema 2020-12, `additionalProperties: true`) |
| `data/registry.json` | Mock registry — **public keys only** + `verified` |
| `data/dev/dev_keys.json` | **gitignored** dev-only private seeds (so the supplier UI can sign as a registered identity) |
| `data/tools/gen_mock.py` | Generates registry + dev keys + 11 signed fixtures (deterministic keys → stable across reruns) |
| `backend/tests/fixtures/*.json` | 11 fixtures (see §6) |
| `scripts/seed.py` | Seed all fixtures into the running backend for manual UI testing |
| `scripts/run_chain.py` | Ingest + verify any chain JSON (the event-day harness) |
| `scripts/selftest.py` | One command: pytest + live e2e (skips e2e if backend down) |
| `scripts/e2e_check.py` | Live e2e over all fixtures + `/draft` + `/ask` |
| `scripts/spike_claude.py` | Confirm `ANTHROPIC_API_KEY` works |

---

## 5. Frontends

### Purchaser (`frontend/purchaser`)
- QR scanner **with manual root-hash entry fallback** (camera needs localhost/HTTPS).
- Verdict card (designation, %, cost-by-country, integrity).
- **Live provenance graph** (Cytoscape) — colored by real node status (green CA / grey foreign / red invalid), driven by `/verify`'s `graph`.
- **Strategic-criticality panel** — class + value-add + country, with a ⚠ offshore flag on critical foreign nodes.
- **"View calculation details" modal** — CSS pie (cost-by-country) + per-component contribution bars; dependency-free.
- **NL-verifier ("Ask") panel** — calls `/ask` (advisory; cites attestation ids).
- **Manual** — VS Code-style sectioned reference (overview, process, designations, calculation, integrity, data format, trust model, graph, criticality, glossary).
- Mock/live toggle via `?mock=0` / `VITE_USE_MOCK`.

### Supplier (`frontend/supplier`)
- Form → schema-validate → confirm → **sign (Ed25519 client-side)** → submit.
- **Load demo identity** — loads a registry-trusted key so authored attestations verify green.
- **Draft with AI** — plain English → `/draft` → fills the form (human reviews & signs).
- Canonicalization self-test (proves the browser signer matches backend bytes).

---

## 6. Test coverage

**40 unit tests** (`backend/tests/`, all passing) across:
`test_smoke.py` (boot, contracts, crypto round-trip), `test_verify.py` (all fixtures,
cycle/self-ref guards, subtree %, advisory flags), `test_anomaly.py`,
`test_robustness.py` (empty store, missing root, malformed degrade-gracefully, schema),
`test_spec.py` (DSSE round-trip, cost-flow variants, ST strategies, multi-shape registry),
`test_ai.py` (key-optional 503 behaviour).

**11 live e2e fixtures** (`scripts/e2e_check.py`, all passing):

| Fixture | Designation | Reason / note |
|---|---|---|
| happy_path | MADE_IN_CANADA (96.6%) | clean 4-tier chain |
| product_of_canada | PRODUCT_OF_CANADA (100%) | all-CA |
| foreign_assembly | NONE | ≥98% cost but last ST in CN |
| tampered | NONE | SIGNATURE_INVALID |
| unknown_issuer | NONE | UNKNOWN_ISSUER |
| broken_link | NONE | BROKEN_LINK |
| duplicate_input | NONE | BROKEN_LINK (+ mass-balance) |
| overdraw | NONE | MASS_BALANCE |
| replay | PRODUCT_OF_CANADA | REPLAY_DETECTED (duplicate excluded) |
| temporal | PRODUCT_OF_CANADA | TEMPORAL_INVERSION (advisory) |
| anomaly | PRODUCT_OF_CANADA | ANOMALY (valid sig, ~5× labour) |

Plus `/draft` (schema-valid draft) and `/ask` (answer + citation) verified live with a key.

---

## 7. Milestone coverage

**Phase 0 / setup (S1–S4):** stack, compose, skeleton, internal model, 6 adapter stubs, mock data — ✅
**Lane A (P0/P1):** A1 graph, A2 content math, A3 precedence, A4 mass-balance, A5 anomaly, A6 purchaser, A7 supplier — ✅
**Lane B skeleton:** B1 sig/schema verify (own keys), B2 compose + internal self-test — ✅
**Remaining-plan workstreams:**
- WS1 correctness hardening (temporal, subtree %, replay/self-ref/dup-input/anomaly fixtures, robustness, annotations) — ✅
- WS2 live graph (`/verify` topology + purchaser render) — ✅
- WS3 demo closure (deterministic keys, demo identity, `/registry`) — ✅
- WS4 adapter swap-harness (`spec.py`, DSSE/PAE, ST strategies, cost-flow variants, multi-shape registry, `run_chain.py`) — ✅
- WS5 advisory AI (`/draft`, `/ask`, criticality overlay; never in the verdict path) — ✅
- WS6 docs/packaging (plan, kickoff checklist, demo script, selftest) — ✅
**Plus** the calculation-details modal and the in-app Manual.

---

## 8. Intentionally NOT built (out of scope / event-day)

- The **final adapter bodies** + the 4 unknowns → done on 30 May (see `02-event-day-swap-guide.md`).
- Credential-chain / revocation checks (depend on the provided registry/accreditation format).
- The **official** self-test harness wiring (only exists at kickoff).
- Cut pile (per `dev-milestones` App. F): transparency log, RFC-3161 timestamps, DIDs/VCs,
  hardware signing, privacy/zk selective disclosure, document-upload extraction,
  reconciliation pipeline. Mentioned in the pitch as roadmap only.

---

*RedTeam DefTech Ottawa · TrueNorth · pre-event implementation record*
