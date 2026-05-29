  # Pre-Event Remaining Build Plan — everything we can finish before kickoff

> **Written:** 2026-05-29 (the evening before). **Kickoff:** 2026-05-30, ~5-hour single-day build.
> **Goal of this document:** enumerate *every* piece of work that is **spec-independent** — i.e. buildable tonight without the event-day spec — so that on the day we only do *translation* (fill the six adapter bodies + confirm the four unknowns), not *construction*.
>
> Scope is derived strictly from `developing/`: `cryptographic-provenance-technical-primer_1.md`, `dev-milestones.md`, `pre-event-checklist-en.md`, `build-execution-plan-en.md`, `DESIGN.md`, `build-adopt-ai-plan.md`.
>
> This supersedes the day-of triage ordering for the *prep window only*. Time is **not** the constraint tonight — completeness is. We build everything behind the adapter boundary.

---

## 0. The one rule that decides what is in scope

> Anything that lives **behind the adapter boundary** — our internal model, our math, our thresholds, our UI shapes, our reason enum — can be built now. Only the act of plugging the real spec in (the six adapter *bodies*) and the **four genuine unknowns** wait for the day.

**The four unknowns (do NOT bet on these — isolate them):**
1. How "substantial transformation" is identified → `adapters.find_last_st`.
2. Cost-flow / partial-consumption weighting across tiers → `adapters.get_costs` + the math engine.
3. Canonical serialization — DSSE/PAE vs RFC-8785 JCS → `adapters.canonicalize`.
4. Real field names + registry format + official self-test interface → `adapters.validate` / `resolve_key`.

**Hard guarantees that never bend (from `build-adopt-ai-plan` §1, §4):**
- No AI anywhere in the `designation` / `canadian_pct` / `reason` path. AI is advisory only.
- Money is integer cents above the adapter; compare with cross-multiplication, never divide-then-compare.
- Freeze the boundary (enums, shapes, signatures), keep the bodies swappable.

---

## 1. Current state — what is already DONE and green

Verified by reading the code and running `pytest` + `scripts/e2e_check.py` (7/7 fixtures pass) against the live Docker backend.

| Area | Status |
|---|---|
| Backend skeleton, 3 locked routes, `/health`, CORS, Docker Compose, Dockerfiles, README | ✅ |
| Internal model (`models.py`), 6 adapter stubs (`adapters.py`) | ✅ |
| Chain build + bidirectional edges + Kahn topo-walk + cycle guard (`chain.py`) | ✅ |
| Canadian-content math + two-condition verdict, integer cents, cross-multiplication (`content.py`) | ✅ (hand-calc asserted: 1470/1420/96.6%) |
| Precedence engine — `UNKNOWN_ISSUER → SIGNATURE_INVALID → REPLAY_DETECTED → BROKEN_LINK / CYCLE → MASS_BALANCE` (`verify.py`) | ✅ |
| Mass-balance overdraw (`massbalance.py`), advisory anomaly IsolationForest + z-score fallback (`anomaly.py`) | ✅ |
| `gen_mock.py` + 7 signed fixtures, pytest suite, `e2e_check.py` | ✅ |
| Supplier UI (form → validate → sign → submit, canonical self-test) | ✅ |
| Purchaser UI (verdict card, cost breakdown, anomaly list, QR scanner) | ✅ |

**Known gaps** (the rest of this document): the provenance graph is static mock; several named checks from the design docs are not yet implemented; the supplier→verify demo loop doesn't close (signing key not in registry); no adapter swap-harness; no AI advisory features; demo script not drafted.

---

## 2. Workstreams

Six workstreams. Each task has an **ID**, **what / why**, **files**, **done-when**, **priority** (P0 scored core · P1 scored anomaly/edge · P2 demo · P3 bonus), and **deps**.

---

### WS1 — Backend correctness & anomaly hardening  *(P0/P1 — the scored dimension)*

These are checks the design docs name explicitly but the code does not yet implement, plus the test coverage for reason codes that exist but are untested. All pure internal logic on our frozen model.

| ID | What / Why | Files | Done-when | Pri | Deps |
|---|---|---|---|---|---|
| **1.1** | **Temporal-inversion check.** Flag any edge where a consumer's `timestamp` precedes its input's (`DESIGN §9 temporal_inversion`, `build-adopt §2.3`, `build-execution A3`). Advisory flag — does **not** change the verdict. Add `TEMPORAL_INVERSION` to the `Reason` enum (advisory). | `models.py`, `verify.py` | A chain with an out-of-order edge produces a `TEMPORAL_INVERSION` advisory anomaly; verdict unchanged; happy-path stays clean. | P1 | — |
| **1.2** | **subtreePercent per node.** Canadian % over the de-duplicated set reachable through each node's `inputs` (`build-adopt §2.5`, `build-execution Appendix D`). Needed for the verdict card *and* per-node graph colouring. | `content.py`, `verify.py`, `models.py` (Node field) | Each node carries a `subtree_percent`; root's equals the chain `canadian_pct`; unit-tested on happy-path. | P1 | — |
| **1.3** | **Replay fixture + coverage.** `REPLAY_DETECTED` logic exists but no fixture exercises it. Add `replay.json` (two attestations sharing `(supplier_id, output.product_id)` both reachable from root). | `data/tools/gen_mock.py`, `tests/test_verify.py`, `scripts/e2e_check.py` | `replay.json` returns `REPLAY_DETECTED` and `NONE`; covered by pytest + e2e. | P1 | 3.1 |
| **1.4** | **Self-reference cycle test.** `build-adopt §2.3` requires `CYCLE_DETECTED` *including self-reference*. The Kahn guard should catch a node consuming itself — prove it. | `tests/test_verify.py` | A self-referencing node is detected as a cycle (fatal `NONE`). | P1 | — |
| **1.5** | **Malformed / missing-field handling + fixture.** `DESIGN §9 missing_field` = "flag, degrade gracefully." Ensure the verify path never crashes on a missing/extra field and surfaces `MALFORMED`; add a `malformed.json` fixture. | `adapters.py`, `verify.py`, `tests/`, `gen_mock.py` | A malformed attestation is rejected at POST *and* a chain containing one degrades gracefully (no 500, useful partial result). | P1 | — |
| **1.6** | **Duplicate-input-ref check.** `build-adopt §2.3` lists "duplicate id" as a `BROKEN_LINK` sub-case. Flag a node that lists the same input hash twice. | `verify.py`, `tests/` | A node with a duplicated `InputRef` is flagged. | P1 | — |
| **1.7** | **Robustness / graceful-degradation tests.** Empty store, root hash absent, node with no inputs, all-foreign chain, zero-cost node. The primer scores "handle incomplete data without falling over." | `tests/test_robustness.py` (new) | All edge inputs return a well-formed `VerificationResult`, never an exception. | P1 | — |
| **1.8** | **`annotations` area on `Node`.** `M0.3` / `DESIGN §4` call for an optional overlay area (consumed later by WS5 criticality overlay). Add now so the model is frozen correctly. | `models.py` | `Node` has an `annotations: dict` defaulting to `{}`; nothing reads it in the verdict path. | P2 | — |

---

### WS2 — Live provenance graph  *(P2 — the single biggest demo gap)*

The purchaser graph is always the hardcoded `mockGraph`, even in live mode, so it contradicts the real verdict. The backend already computes the topology (`chain.by_hash` with `input_hashes` / `consumer_hashes` / `status`); we only need to serialize and wire it. This is the locked `Graph` shape from `build-adopt §2.3` / `DESIGN §4`.

| ID | What / Why | Files | Done-when | Pri | Deps |
|---|---|---|---|---|---|
| **2.1** | **Add `graph` to the `/verify` response.** Serialize `{ nodes:[{id, label, supplier_id, product_id, country, status, subtree_percent}], edges:[{source, target}] }` (edge = input→consumer). Node `status` mirrors the `reason` enum one-to-one. | `verify.py` (`result_to_dict`), `main.py` | `GET /verify/{hash}` returns a `graph` object whose nodes/edges match the fixture's real chain; e2e asserts node count + the INVALID node on `tampered`. | P2 | 1.2 |
| **2.2** | **Wire purchaser graph to live data.** In live mode use `response.graph`; keep `mockGraph` only as a mock-mode fallback. Colour by real `status` (INVALID→red, CA→green, other→grey). | `frontend/purchaser/src/App.jsx`, `api.js` | With `?mock=0`, the graph beside the verdict reflects the scanned chain; the red node is the one that actually failed verification. | P2 | 2.1 |
| **2.3** | **Graph robustness in the renderer.** `ProvenanceGraph` must handle any DAG depth/size (4-node toy ↔ 50-node tree) — never assume the 7-node drone layout (`build-adopt §7 flex`). Verify layout + fit on a large synthetic graph. | `frontend/purchaser/src/components/ProvenanceGraph.jsx` | A 30-node synthetic chain renders without overflow; legend + colours correct. | P2 | 2.2 |

---

### WS3 — Supplier → verify demo closure  *(P2 — a working full-stack story)*

Today an attestation authored in the supplier UI is rejected `SIGNATURE_INVALID`, because the UI signs with a freshly-generated key that isn't in the registry, and the registry's matching private keys are ephemeral (discarded by `gen_mock`). Close the loop **without** polluting the registry with private keys.

| ID | What / Why | Files | Done-when | Pri | Deps |
|---|---|---|---|---|---|
| **3.1** | **Deterministic mock keys + dev-key export.** Derive each supplier's Ed25519 key from a fixed seed (e.g. `sha256("maple-ledger-mock-v1::" + supplier_id)`), so `registry.json` + fixture signatures are **stable across reruns** (today they churn every run — a hidden fragility). Export the 32-byte seed hex per supplier to `data/dev/dev_keys.json` (gitignored). Registry keeps **public keys only** — faithful to the event-day format. | `data/tools/gen_mock.py`, `.gitignore` | Re-running `gen_mock` yields identical `registry.json`; `dev_keys.json` exists with one seed per supplier; pytest + e2e still 7/7. | P2 | — |
| **3.2** | **Supplier "load demo identity" affordance.** A button/dropdown that loads a registered seed (from `dev_keys.json`, surfaced via a tiny dev endpoint or bundled JSON) into the existing `keypairFromPrivateHex` path, so an authored attestation verifies green. Default the form's `supplier_id` to match. | `frontend/supplier/src/App.jsx`, `lib/api.js` (or a `dev_keys` import) | Author → submit → `verify ?mock=0` returns a real positive designation for a single-node CA attestation; the demo loop is green. | P2 | 3.1 |
| **3.3** | **Read-only registry viewer.** `DESIGN §5`: the registry is read-only ground truth. Expose `GET /registry` (public keys + verified flags) and a small purchaser/supplier panel that lists trusted identities. Good demo narrative ("the system trusts *these* identities; everything else is rejected") and a debugging aid. Stays behind `resolve_key`. | `main.py`, a small UI panel | `GET /registry` returns the loaded registry; a UI panel renders supplier_id → key fingerprint → verified. | P2 | — |

---

### WS4 — Adapter swap-harness & kickoff readiness  *(Lane C de-risk — "pre-build around it")*

We cannot write the **final** adapter bodies (they need the spec). We **can** pre-stage the likely variants behind a single selector so the day-of change is a toggle + a confirmation, not new code under pressure. `build-adopt §2.2` already *decides* DSSE is the probable serialization — staging it is the highest-value de-risk.

| ID | What / Why | Files | Done-when | Pri | Deps |
|---|---|---|---|---|---|
| **4.1** | **Single `spec.py` selector module.** One file that chooses which variant each adapter uses (serialization, ST-rule, registry-shape, cost-flow). Day-of edits localize here. | `backend/app/spec.py` (new), `adapters.py` | All adapter variant choices read from `spec.py` constants/env; default = today's behaviour; tests green. | P1 | — |
| **4.2** | **DSSE/PAE canonicalizer variant.** Pre-write a PAE encoder (`DSSEv1` + `payloadType`) alongside the current JCS `canonicalize`, selectable via `spec.py`. Unknown #3 — the most likely day-of gotcha. | `adapters.py`, `spec.py`, `tests/test_canonical.py` | Round-trip test: sign with PAE → verify with PAE passes; JCS path still passes; switching is a one-constant change. | P1 | 4.1 |
| **4.3** | **`find_last_st` strategy variants.** Three pluggable strategies — current flag, an `activity`-enum strategy, a `location`/`performedInCanada` strategy — selected via `spec.py`. Unknown #1 (the biggest verdict-mover). | `adapters.py`, `spec.py`, `tests/` | Each strategy is unit-tested on a tailored chain; default unchanged. | P1 | 4.1 |
| **4.4** | **Cost-flow variants in `get_costs` / math.** Pre-stage both "full-cost-once (no weighting)" and the current consumption-fraction weighting, selectable via `spec.py`. Unknown #2. | `content.py`, `adapters.py`, `spec.py`, `tests/` | Worked example asserted under *both* rules; switch is one constant. | P1 | 4.1 |
| **4.5** | **Pluggable registry loader.** Accept 2–3 plausible shapes: `{id:{public_key,verified}}` (current), `[{issuerId,publicKey,verified}]`, nested `{issuers:{...}}`. Normalize to our internal map in `resolve_key`/`registry.py`. Unknown #4. | `registry.py`, `adapters.py`, `tests/` | Each shape loads to the same internal map; current fixture still verifies. | P1 | 4.1 |
| **4.6** | **Schema extensibility audit.** Ensure `schema/attestation.schema.json` tolerates optional additive fields the spec may carry (`activity`, `nonce`/`lot_id`, `encryptedCosts`, `rangeProof`) without rejecting them (`build-adopt §2.9, §9`). | `schema/attestation.schema.json` | Schema accepts extra optional fields; current fixtures still validate. | P2 | — |
| **4.7** | **Sample-chain ingest harness + kickoff checklist.** A script that loads an arbitrary provided chain file into the store and runs verify, plus `developing/kickoff-checklist.md`: the 4 unknowns, the exact file+line to change for each, and the day-of sequence. | `scripts/run_chain.py` (new), `developing/kickoff-checklist.md` (new) | `python scripts/run_chain.py <file>` prints the verdict for any chain JSON; checklist reviewed. | P1 | 4.1–4.5 |

---

### WS5 — AI advisory features  *(P3 — bonus, all advisory, none touch the verdict)*

Spec-independent (they operate on our mock schema; day-of is a field remap). Each obeys the two rails: every fact cites an attestation/registry id, and every AI proposal passes a deterministic gate before it becomes signed bytes. **Dependency:** `ANTHROPIC_API_KEY` — build to use it when present, degrade gracefully when absent.

| ID | What / Why | Files | Done-when | Pri | Deps |
|---|---|---|---|---|---|
| **5.1** | **Claude API spike (`M0.7`).** Confirm the key works from a tiny backend call; pin the SDK + model id (`claude-...`). | `scripts/spike_claude.py` (new) | A hello-world call returns; key + model confirmed. | P3 | key |
| **5.2** | **Conversational authoring (`M5.1` / Mode 1).** Supplier types plain English ("CNC-milled 50 airframes, 3 machinists × 6 hrs at $42/hr"); LLM drafts a Statement; **schema-validated**, human edits every field, then signs. LLM never touches the key. | `frontend/supplier` + a backend `/draft` proxy | NL input produces a schema-valid draft that the existing sign/submit flow accepts after human review. | P3 | 5.1 |
| **5.3** | **Anomaly demo scenario (cost-inflation).** A fixture with a valid signature but 5× labour cost; the existing `anomaly.py` returns a high score and the auditor queue lights up — the "crypto for integrity, AI for plausibility" 30-second beat. (Deterministic model, but it's the headline AI-story demo.) | `gen_mock.py`, purchaser anomaly panel | An inflated-cost node scores high, keeps a valid signature, verdict unchanged. | P2 | — |
| **5.4** | **Natural-language verifier (`M5.2` / Mode in §2.8).** NL question → LLM rewrites to a **deterministic graph query** → answer with attestation-id citations. Numbers come from the math, never the model. | backend query layer + purchaser panel | "Which inputs trace to a foreign supplier?" returns correct node ids with citations. | P3 | 5.1 |
| **5.5** | **Strategic-criticality overlay (`M5.3`).** Annotate nodes `critical/standard/commodity` in the `Node.annotations` overlay; a separate purchaser view. Never alters the legal verdict. | `backend` overlay + purchaser view | Purchaser shows the legal verdict *and* a separate criticality lens. | P3 | 1.8 |

> Per the golden rule, WS5 starts only after WS1–WS4 are green. Realistically pick **5.3 + 5.2** as the two highest-ROI demo beats; treat 5.4 / 5.5 as stretch.

---

### WS6 — Demo, packaging, docs  *(P2)*

| ID | What / Why | Files | Done-when | Pri | Deps |
|---|---|---|---|---|---|
| **6.1** | **Demo script + attack scenarios (`M6.1`).** Written narrative running tamper / forge (unknown issuer) / replay / overdraw + the anomaly score, showing the percentage never moving on a forged attempt. Finalize live numbers on the day. | `developing/demo-script.md` (new) | A rehearsable script covering all five attack categories + the happy path. | P2 | WS1 |
| **6.2** | **Self-test harness polish (`M6.2`).** A single `scripts/selftest.py` (or `make selftest`) that runs pytest + e2e over all fixtures from a clean clone; document the exact run command; versions already pinned. | `scripts/selftest.py`, `README.md` | Clean clone → `docker compose up` → selftest passes all fixtures. | P0 | WS1 |
| **6.3** | **QR scan proven in a real browser (`M0.6`).** Verify camera scan works on `localhost`/HTTPS with a phone or webcam (the classic silent half-day loss). Confirm manual-hash-entry fallback. | `frontend/purchaser` | A phone/webcam scans a QR into the purchaser UI; manual paste also works. | P2 | — |
| **6.4** | **Pitch deck refresh + rehearsal (`M6.3`).** Decks exist in `doc/`; align them with the now-real graph + anomaly demo, do one run-through. | `doc/*` | One full rehearsal done; deck matches the live demo. | P2 | WS2, 5.3 |

---

## 3. Execution order (dependency-aware)

```
WS3.1  deterministic keys ............ (foundational: regenerates registry+fixtures)
  └─ 1.3 replay fixture, 1.5 malformed fixture, 5.3 anomaly fixture (new fixtures, after stable gen_mock)
WS1.1  temporal check
WS1.2  subtree % ..................... (feeds 2.1 graph)
WS1.4 1.6 1.7  cycle/dup/robustness tests
WS1.8  annotations field ............. (feeds 5.5)
WS2.1  graph in /verify  → 2.2 wire frontend → 2.3 large-graph robustness
WS3.2  supplier demo identity  → 3.3 registry viewer
WS4.1  spec.py selector .............. (then 4.2 DSSE, 4.3 ST variants, 4.4 cost-flow, 4.5 registry shapes)
WS4.6  schema extensibility
WS4.7  ingest harness + kickoff checklist
WS6.1  demo script   WS6.2  selftest script   WS6.3  QR verify
── only if all above green ──
WS5.1 spike → 5.3 anomaly demo (P2, do early) → 5.2 authoring → 5.4 NL verifier → 5.5 overlay
WS6.4  deck refresh + rehearsal
```

**Re-run `pytest` + `scripts/e2e_check.py` after every task.** Rebuild the Docker images (`docker compose up --build`) after any change under `data/` or `schema/`, since they are baked into the backend image at build time.

---

## 4. What is explicitly LEFT for the day (do NOT pre-build)

- The **final bodies** of the six adapters — filled at kickoff from the real spec (WS4 only *stages* the variants).
- **Credential-chain / revocation** checks (`build-adopt §2.1`) — depend on the provided registry/accreditation format.
- The **official self-test harness** wiring — only exists at kickoff; match its service name / port / run command then.
- **Transparency log, RFC-3161 timestamps, privacy/zk, DIDs/VCs, hardware signing** — all in the cut pile (`dev-milestones Appendix F`); zero build hours.
- Cross-chain **replay by product/lot id** — needs the spec's output identity; our within-chain serial check stands in.

---

## 5. Definition of "ready for kickoff"

We are ready when, tonight:
1. WS1 + WS2 + WS3 + WS4 are green (`pytest` + `e2e` + a clean `docker compose up` with the live graph and a green supplier→verify loop).
2. `developing/kickoff-checklist.md` lists the four unknowns and the exact one-file changes for each.
3. The demo script (WS6.1) runs end-to-end on mock data.
4. WS5 is bonus — any of it that lands is upside.

Then the day is what the plan always promised: **translate → swap → wire → submit.**

---

*RedTeam DefTech Ottawa · companion to dev-milestones.md / pre-event-checklist-en.md / build-execution-plan-en.md / DESIGN.md / build-adopt-ai-plan.md*
