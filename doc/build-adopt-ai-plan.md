# Build vs Adopt vs AI — Decision Plan

> Covers four questions, in one document:
> 1. Where can we use an **AI agent**?
> 2. Where must we use a **fixed workflow** (deterministic code, no AI in the path)?
> 3. What **existing techniques / libraries** should we adopt instead of building?
> 4. Which parts must be **locked by the 27 May freeze and never change**, and which parts must **stay flexible** — with reasons?
>
> Companion to `data-contract-v0.2-draft.md` (the shape contract) and `Maple_Ledger_Design_Document.docx` (the full system design). This doc decides the *roles*; those decide the *shapes*.

| | |
|---|---|
| Status | DRAFT — feedback welcome until **27 May 2026** |
| After freeze | Sections 1–5 are policy and stay editable; per-layer "Lock by 27 May" rows do not |
| Owner | All three lanes co-own |

---

## 0. How to read this document

| You are… | Read |
|---|---|
| Planning / aligning the team | §1 (principles) · §2 (per-layer table) · §6 (lock checklist) · §7 (flex checklist) |
| Building Lane 2 (crypto) | §1 · §2.1 · §2.2 · §2.4 · §6 · §7 |
| Building Lane 3 (data / graph / math) | §1 · §2.3 · §2.5 · §2.6 · §6 · §7 |
| Building Lane 1 (frontend / demo) | §1 · §2.7 · §2.8 · §2.10 · §3 · §6 · §7 |
| Writing the pitch | §1 · §3 · §2.10 |

Everyone reads §1 and §8 (the decision checklist).

---

## 1. The two principles behind every decision

### 1.1 Crypto for integrity. AI for plausibility.

Signatures and hashes prove a record has not been altered. AI flags whether a record is *realistic*. The two are complementary; neither substitutes for the other.

The hard line that follows from this principle:

> **If an output influences the legal `verdict` or any `reason` code, it is fixed workflow.** No AI in that path. Ever.

Everything else — drafting, scoring, ranking, reconciling, explaining, summarising — is fair game for AI, but **always advisory**: AI proposes, deterministic code disposes, humans sign.

### 1.2 Lock the contract. Keep the implementations swappable.

Two different things freeze at two different rates.

- **Data shapes, enums, and function signatures** must lock by 27 May so all three lanes can integrate without rework. After the freeze: additive only.
- **Implementation choices** — which Merkle library, which anomaly detector, which LLM, which graph renderer — must stay swappable, because the 27 May technical spec or event-day data could force a change.

The cost of getting this wrong in either direction:
- Locking too little → integration breaks because one lane changed a field name.
- Locking too much → a forced spec change ripples through every file.

The rule: **freeze the boundary, not the body.**

---

## 2. Per-layer decisions

Each layer below has four rows:

- **Adopt — do not build**: vetted standards or libraries we depend on.
- **Fixed workflow**: deterministic code we write. No AI.
- **AI-assisted (advisory only)**: where an LLM or ML model adds value without touching the verdict path.
- **Lock by 27 May / Keep flexible**: which boundaries must freeze and which implementations must stay swappable, with reason.

---

### 2.1 Identity & Accreditation
*(Maple Ledger §5 · Contract §1.3)*

**Adopt — do not build**
- **W3C Decentralized Identifiers** (`did:web` method) — supplier identity anchored at a Canadian-controlled domain.
- **W3C Verifiable Credentials** — the "Verified Canadian Supplier" credential issued by ISED or a designated body.
- **FIDO2 / WebAuthn + YubiKey or HSM** — hardware-backed key custody.
- **GCKey** or federated provincial identity for supplier portal sign-in.
- For the 72-hr demo: `did:key` is acceptable as a stand-in; mock the accreditation authority as a signed JWT issuer.

**Fixed workflow**
- Registry / credential lookup by `keyid` → entry.
- Credential chain check to accreditation root.
- Revocation check against the revocation registry.
- "Two parts both required": (a) key present and `verified: true`; (b) *that same key* verifies the signature. Failure of either → `UNKNOWN_ISSUER`.

**AI-assisted**
- **None.** Signing is human + HSM only. AI never touches the private key.

**Lock by 27 May**
- The registry shape (`registry.schema.json`), `issuerId` field naming, the `verified` boolean.
- *Why locked:* L2 verification reads this shape on every check; renaming `verified` after the freeze silently breaks every chain.

**Keep flexible**
- Whether identity is `did:key` (demo) or `did:web` (production); whether the accreditation root is ISED or a designated body.
- *Why flexible:* the 27 May spec or pilot scope may pick a different identity method. Keep the verifier's key-resolution step behind one function so swapping the method is a one-file change.

---

### 2.2 Attestation primitive
*(Maple Ledger §6 · Contract §1.2, §2.2)*

**Adopt — do not build**
- **DSSE** (Dead Simple Signing Envelope) — removes JSON canonicalization entirely; you sign the exact transmitted bytes via PAE.
- **Ed25519** (RFC 8032) via a vetted library — `pyca/cryptography` (Python, primary) or `@noble/ed25519` (JS/TS, browser only).
- **SHA-256** (FIPS 180-4) — for key fingerprints and content addressing.
- **RFC 8785 JCS** (only if you are NOT using DSSE) — JSON Canonicalization Scheme.
- **JSON Schema 2020-12** — for `MALFORMED` rejection.
- **ULID** lib for `attestationId`.
- **RFC 3161** trusted timestamp from a Canadian TSA — anchors signing time independent of the issuer's clock.

> **Decision:** the contract picks **DSSE over JCS+SHA-256+signature**, because DSSE removes the "did you sort the keys / escape the accent" risk that bit the v0.1 design (see Maple Ledger §6.2 vs. v0.2 §2.2). This is a one-way door; pick DSSE and stick with it.

**Fixed workflow**
- `signAttestation(statement, privateKey) → Envelope`
- `verifyAttestation(envelope, registry) → VerifyResult`
- Schema validation against `statement.schema.json`.
- Integer-cents enforcement: `0 ≤ canadianCostCents ≤ totalCostCents`, integers only, no floats.

**AI-assisted**
- **Attestation authoring assistant** (Maple Ledger §11.1): a medium-sized LLM converts unstructured supplier inputs (invoices, payroll exports, BoM spreadsheets, plain English) into a draft Statement.
  - **Constraint 1:** output is strictly schema-validated; mismatches are rejected, not corrected silently.
  - **Constraint 2:** a retrieval layer grounds NAICS codes, supplier addresses, and exchange rates in authoritative registries — never invented.
  - **Constraint 3:** the human reviews and edits every field before signing.
  - **Constraint 4:** the LLM never touches the private key.

**Lock by 27 May**
- Statement field set, field names, field types, enum values.
- Envelope shape (`payload`, `payloadType`, `signatures[]`).
- `contractVersion = "0.2"`.
- Signing algorithm: `Ed25519`.
- PAE formula (the one and only signing input).
- Money is **integer cents**, no floats.
- *Why locked:* one renamed field, one re-typed integer-vs-string, one re-ordered key, and every previously signed attestation fails verification. This is the most expensive thing in the system to change after the freeze.

**Keep flexible**
- Which Ed25519 library, which TSA, which schema validator.
- *Why flexible:* libraries get deprecated; pin the algorithm name (`Ed25519`) in one constant and the library behind one signing function so swapping is local.

---

### 2.3 Provenance graph
*(Maple Ledger §7 · Contract §3.3)*

**Adopt — do not build**
- **Cytoscape.js**, **React Flow**, or **D3** for graph rendering in the frontend.
- Content-addressed references (SHA-256 of canonical Statement bytes) — the linking mechanism. No bespoke hash-chain.

**Fixed workflow**
- `buildGraph(envelopes[]) → Graph` — turns flat attestations into nodes + edges via the `inputs` array.
- Visited-set cycle guard.
- `BROKEN_LINK` checks: dangling input id, duplicate id, bad tier-0 count, missing referenced attestation.
- `CYCLE_DETECTED` — including self-reference.
- **Mass-balance check** (new vs. v0.2; from Maple Ledger §7.2): Σ qty consumed across downstream ≤ qty produced upstream. Closes the partial-consumption / over-claim attack.
- Timestamps monotonic along input → output direction.
- Output serial uniqueness (one (issuerId, output serial) pair only).

**AI-assisted**
- **Graph risk analysis** (offline batch, Maple Ledger §11.4):
  - Wash-ring detection — suppliers attesting predominantly to each other with little outside trade.
  - Sudden capacity claims inconsistent with historical baseline.
  - Cluster correlation with sanctioned or politically-exposed entities.
  - Output: a risk dashboard for procurement during source selection. **Never** alters a node's `status` or the `verdict`.

**Lock by 27 May**
- `Graph` shape (the `nodes[]` / `edges[]` JSON the frontend consumes).
- The `status` field on a node mirrors the §1.4 `reason` enum — one-to-one.
- *Why locked:* L1 reads this shape on every render; the graph view's whole component tree is built against it.

**Keep flexible**
- The graph algorithm internals (BFS vs. DFS, in-memory vs. SQLite-backed).
- The renderer (Cytoscape vs. React Flow). Render against the `Graph` shape, not a library-specific format.
- *Why flexible:* event-day data may be a 50-node tree or a 4-node toy. The renderer must handle *any* DAG.

---

### 2.4 Transparency log
*(Maple Ledger §8)*

**Adopt — do not build**
- **Sigstore Rekor** or **Trillian** (CT-style Merkle log) for production.
- For the 72-hr demo: a **minimal in-process Merkle log** in pure Python or TS — append, root hash, inclusion proof, consistency proof. ~150 lines.

**Fixed workflow**
- Append-only hash inclusion.
- Signed Tree Head (STH) — signed root hash at a moment in time.
- Inclusion proofs and consistency proofs.
- STH gossip across independent monitors (production); single-node STH (demo).
- Uniqueness enforcement on (`issuerId`, output serial) pairs.

**AI-assisted**
- **None.** A transparency log is the canonical example of "must be deterministic and reproducible by any third party." AI has no role.

**Lock by 27 May**
- Whether the demo includes a log at all (the v0.2 contract does not require one; Maple Ledger does).
- *Why locked:* the verifier algorithm changes structurally if the log is required. Decide now.

**Keep flexible**
- The log implementation (custom Merkle vs. Rekor vs. Trillian).
- *Why flexible:* the hackathon's minimal log is throwaway; production runs Rekor or equivalent. Behind one `log.append(hash)` / `log.includes(hash)` interface.

---

### 2.5 Canadian-content math — the legal output
*(Maple Ledger §9 · Contract §3.4, §3.5)*

This layer has the strongest "no AI" guarantee in the whole system. Read carefully.

**Adopt — do not build**
- **Competition Bureau of Canada — "Product of Canada" and "Made in Canada" Claims** guidelines. Map the 98% and 51% thresholds **verbatim**. Hard-coded constants in one file.

**Fixed workflow**
- `computeCanadianContent(envelopes[]) → ContentResult`.
- The math, exactly:
  ```
  totalCostCents    = Σ contribution.totalCostCents      over all attestations
  canadianCostCents = Σ contribution.canadianCostCents   over all attestations
  percent           = round( canadianCostCents / totalCostCents * 100 )
  ```
- `subtreePercent` per node = the same ratio over the de-duplicated set reachable through `inputs`.
- Verdict mapping:
  - `PRODUCT_OF_CANADA` ← `percent ≥ 98` AND tier-0 `performedInCanada = true`.
  - `MADE_IN_CANADA` ← `percent ≥ 51` AND tier-0 `performedInCanada = true`.
  - `NONE` otherwise.
- The `performedInCanada` boolean is the **only** machine-readable Canadian-work signal. `location` is free text, display only. Never parsed by any algorithm.

**AI-assisted**
- **NEVER.** This is the legal output. An LLM saying "this looks 81% Canadian" has no place anywhere in the verdict path.

**Lock by 27 May**
- The thresholds (98 / 51), the formula, the rounding, the `verdict` enum strings, the `performedInCanada` field name and type, integer cents.
- *Why locked:* this is the part of the system a court could audit. Every locked element here is a defensible claim; changing one breaks reproducibility for anything already signed.

**Keep flexible**
- The data file behind `computeCanadianContent` — `mock-drone.json` will be replaced by event-day data wholesale.
- *Why flexible:* the 27 May spec may rename direct-cost categories, change tier depth, or replace the use case. Never hard-code `81` or the word "drone" in the math.

---

### 2.6 Threat detection
*(Maple Ledger §10, §11.2, §11.3)*

Split into two halves: deterministic structural checks (workflow) and probabilistic plausibility checks (AI).

**Adopt — do not build**
- **scikit-learn IsolationForest** or **PyOD** for unsupervised anomaly detection.
- **XGBoost / LightGBM** for the supervised cost-outlier model (if we have labels).
- **StatsCan** wage data by NAICS and economic region — the benchmark dataset.
- **CBSA** import records (where consented) — for the cross-document reconciliation step.
- **NAICS** classification lookup.
- **Anthropic Claude API** for the reconciliation agent (tool-using LLM).

**Fixed workflow** — structural integrity, the deterministic half
- `SIGNATURE_INVALID` — DSSE signature does not verify.
- `UNKNOWN_ISSUER` — keyid not in registry / not verified / key doesn't verify the sig.
- `REPLAY_DETECTED` — wrong `productId`, duplicate `attestationId`, or duplicate `nonce`.
- `MALFORMED` — schema validation failure or invariant violation.
- `BROKEN_LINK` / `CYCLE_DETECTED`.
- **Precedence order is fixed:** `MALFORMED → SIGNATURE_INVALID → UNKNOWN_ISSUER → REPLAY_DETECTED → BROKEN_LINK / CYCLE_DETECTED`.

**AI-assisted** — plausibility, the advisory half
- **Anomaly detection** (Maple §11.2): risk score in [0, 1] per attestation. Features:
  - Labour cost per unit time vs. StatsCan benchmark by NAICS + region.
  - Material cost as fraction of output value vs. industry norms.
  - Throughput vs. attested facility capacity.
  - Geographic plausibility (claimed raw material vs. regional geology).
  - Temporal patterns (off-hours bursts, unusual filing cadence).
- **Cross-document reconciliation** (Maple §11.3): LLM agent with tool access produces a structured reconciliation report — CBSA imports, downstream BoMs, public registries, payroll filings. Outputs *recommendations*; a human auditor makes the final call.
- **Rule, repeated:** these models queue attestations for auditor review. They do **not** invalidate, do **not** alter the `verdict`, do **not** set a `reason` code.

**Lock by 27 May**
- The `reason` enum and its precedence order.
- The structural-integrity check set.
- *Why locked:* L1's red-alert copy keys off these exact strings.

**Keep flexible**
- Which anomaly algorithm; which features; which LLM; which benchmark dataset.
- *Why flexible:* model performance is empirical. The `risk_score` and `anomaly` outputs are advisory metadata, not contract fields. Swap models freely.

---

### 2.7 Supplier UX
*(Maple Ledger §12 · Contract §4 supplier room)*

**Adopt — do not build**
- **React + Tailwind** for the UI.
- **GCKey** / WebAuthn for sign-in.
- **YubiKey / HSM SDK** for the signing step.

**Fixed workflow**
- Form validation against `statement.schema.json` *before* anything is sent for signing.
- The signing flow itself: produce canonical bytes → human confirms → hardware signs → submit envelope.

**AI-assisted**
- **Mode 1 — Conversational authoring** (Maple §12.2): supplier dictates or types in plain English. LLM produces a draft Statement. Supplier reviews, edits, signs.
- **Mode 2 — Document upload extraction**: drop invoice / payroll / BoM. LLM extracts structured fields into the Statement. Supplier reviews, signs.
- **Mode 3 — API**: supplier ERP posts directly. No AI in the path. Used by Tier-1 integrators with hardened pipelines.

**Lock by 27 May**
- The signing flow: human confirms → hardware signs. No exceptions.
- *Why locked:* every accountability and audit story in the design rests on a human signing.

**Keep flexible**
- Which LLM, which prompt, which extraction strategy.
- *Why flexible:* model quality changes monthly. The schema validator is the gate; the LLM can be swapped without changing the contract.

---

### 2.8 Verifier / Purchaser UX
*(Maple Ledger §13 · Contract §4 purchaser room + auditor room)*

**Adopt — do not build**
- **React** + **Cytoscape.js** (graph view).
- **in-toto Attestation Framework** — cite as the standard our envelope/statement design follows. A real standard to name in the pitch reads as senior.

**Fixed workflow**
- Render the verdict card from the deterministic `ContentResult` — `percent`, `verdict`, `totalCostCents`, `canadianCostCents`. The numbers shown are the numbers computed; the UI does not "interpret" them.
- Render the graph from `Graph` (§2.3). Node colour is driven by `status` (a `reason` enum value).
- Render the verification certificate — itself a signed JSON document — including the attestation hashes, the STH at verification time, and inclusion proofs.

**AI-assisted**
- **Natural-language verifier** (Maple §11.5):
  - User asks: *"Of the 240 drones procured under contract X, how many qualify as Made in Canada with > 75% Canadian content?"*
  - LLM rewrites the question into a deterministic graph query.
  - Query runs against the store.
  - LLM presents the result with **citations back to specific attestation IDs**.
  - **The displayed numbers always come from the deterministic computation, never from the model.**
- **Plain-English node explanation** in the auditor room — render *next to* the `reason` enum, never instead of it.

**Lock by 27 May**
- The frozen `reason` and `verdict` enum strings — copy is written against these.
- The `ContentResult` and `Graph` shapes the UI consumes.
- *Why locked:* changing an enum string after L1 wires it into copy means re-translating every status message and possibly re-shipping copy that legal reviewed.

**Keep flexible**
- Graph rendering library, theme, layout algorithm.
- LLM choice for the natural-language verifier.
- *Why flexible:* event-day data may need a different layout (50 nodes, not 7). Render against the data, not a fixed layout.

---

### 2.9 Privacy / selective disclosure
*(Maple Ledger §15)*

Out of scope for the 72-hr demo, but pin the *intent* before the freeze so future-additive fields fit cleanly.

**Adopt — do not build**
- **Bulletproofs** (or any vetted zk-range-proof library) — prove `percent ≥ 51` without revealing magnitudes.
- **Shamir / threshold-decryption** libs — quorum-gated dollar-amount disclosure.
- **PIPEDA** compliance — personal info referenced by hash only.

**Fixed workflow**
- Encrypt-at-rest of dollar fields with supplier-held key + escrow with accreditation authority.
- Quorum reveal flow (supplier + accreditation authority + Competition Bureau).

**AI-assisted**
- **None.** Privacy primitives are cryptographic; AI has no role.

**Lock by 27 May**
- Whether the v0.2 Statement schema is **extensible** enough to add `encryptedCosts` and `rangeProof` fields later (additive only).
- *Why locked:* the schema's `additionalProperties: false` setting means we must allow these optional fields *in the schema today*, or every supplier integrator breaks when they appear.

**Keep flexible**
- The specific zk scheme, key custody design, escrow agent.
- *Why flexible:* this is post-hackathon work; the scheme decision can shift as we evaluate libraries.

---

### 2.10 Pitch, copy, README, docs

The most AI-friendly layer in the system.

**Adopt — do not build**
- Standard React + markdown stack.

**Fixed workflow**
- Copy strings are keyed off the frozen `reason` and `verdict` enums.
- Translations (if any) bind to the same enum keys.

**AI-assisted**
- Draft the pitch deck, READMEs, error-message variants, the demo script (Maple §17.3).
- Generated **once**, then **frozen** before the demo. Don't regenerate copy during a stage rehearsal.

**Lock by 27 May**
- The product name and the enum-keyed copy strings.
- *Why locked:* L1 code references them by key; renaming after freeze is silent breakage.

**Keep flexible**
- The deck slides, demo narrative, blog posts.
- *Why flexible:* pitch evolves until the morning of the demo.

---

## 3. The four AI placements that will land in the demo

If we only ship four AI features in the 72 hours, these are the ones with the highest ratio of "wow on stage" to "risk of being load-bearing":

1. **Conversational authoring** in the supplier room.
   Supplier types "*We CNC-milled 50 RAVEN-7C airframes from 6061 billet, 3 machinists × 6 hrs each at $42/hr*", LLM produces a structured Statement, supplier signs. Shows AI as accelerator, not authority.

2. **Anomaly score on the live cost-inflation attack** (Maple §16.3 #3).
   A synthetic supplier submits a Statement with 5× normal labour cost. Cryptographic validation passes (the signature is real). AI anomaly score returns 0.94, auditor queue lights up. This is the cleanest demo of *"crypto for integrity, AI for plausibility"* in 30 seconds.

3. **Natural-language verifier** in the auditor room.
   *"Which components in this fleet trace back to a single foreign sub-supplier?"* LLM → deterministic graph query → answer with attestation IDs as citations. The numbers come from the computation; the LLM only frames the question and the explanation.

4. **LLM-drafted reconciliation report** on a BoM mismatch.
   An integrator's declared inputs don't match the downstream BoM. LLM agent produces a structured reconciliation report citing both documents. Shows AI doing the document-comparison work no human wants to do at 2am.

Everything else stays workflow.

---

## 4. The four things AI deliberately does NOT do

*(Maple Ledger §11.6 — keep visible to the team and put in the pitch)*

1. It **does not sign** attestations on behalf of suppliers.
2. It **does not compute** the legal qualification verdict.
3. It is **not the source of truth** for any factual claim — every fact it presents is grounded in an attestation or registry.
4. It **does not participate** in the cryptographic verification path.

These are the four claims defence procurement, auditors, and journalists will press on. Locking them in writing now protects every scope decision later.

---

## 5. Existing standards & libraries — single index

A consolidated reference. Cite these in the pitch; depending on a real standard reads as senior.

| Layer | Standard / Library | Role |
|---|---|---|
| Identity | W3C DIDs (`did:web`) | Supplier identifier |
| Identity | W3C Verifiable Credentials | Accreditation credential |
| Identity | FIDO2 / WebAuthn | Hardware signing key |
| Identity | GCKey | Supplier portal sign-in |
| Attestation | DSSE | Signing envelope |
| Attestation | Ed25519 (RFC 8032) | Signature algorithm |
| Attestation | `pyca/cryptography` (Python) / `@noble/ed25519` (browser) | Vetted Ed25519 library |
| Attestation | SHA-256 (FIPS 180-4) | Content hashing |
| Attestation | RFC 8785 JCS | Canonical JSON (only if not using DSSE) |
| Attestation | JSON Schema 2020-12 | Schema validation |
| Attestation | ULID | Attestation IDs |
| Attestation | RFC 3161 | Trusted timestamps |
| Attestation | in-toto Attestation Framework | The pattern we cite |
| Graph | Cytoscape.js / React Flow / D3 | Graph rendering |
| Log | Sigstore Rekor / Trillian | Production Merkle log |
| Math | Competition Bureau — Made/Product of Canada guidelines | The legal thresholds, verbatim |
| ML | scikit-learn IsolationForest / PyOD | Anomaly detection |
| ML | XGBoost / LightGBM | Supervised outlier scoring |
| ML | StatsCan wage data + NAICS | Benchmark dataset |
| ML | CBSA import records | Cross-document reconciliation |
| LLM | Anthropic Claude API | Authoring assistant, reconciliation agent, NL verifier |
| Privacy | Bulletproofs | zk-range proofs |
| Frontend | React + Tailwind | UI |

---

## 6. What to lock by 27 May — checklist

Everything here must be settled at the 21 May meeting and frozen by 27 May. Each item lists the reason it cannot move.

- [ ] **Statement field set, names, types** — every signed byte references this. One rename invalidates every prior signature.
- [ ] **`contractVersion` string** (currently `"0.2"`) — verifiers reject unknown versions.
- [ ] **Envelope shape** (`payload`, `payloadType`, `signatures[]`) — on the wire between every pair of lanes.
- [ ] **Signing algorithm = Ed25519** — flipping algorithms means rebuilding every key.
- [ ] **PAE formula** — the one and only signing input.
- [ ] **Money model: integer cents, no floats** — float math is non-deterministic across runtimes.
- [ ] **`reason` enum strings + precedence order** — L1 copy and L2 logic both bind to these.
- [ ] **`verdict` enum strings** — same.
- [ ] **`performedInCanada` field name + type (boolean)** — the only machine-readable Canadian-work signal.
- [ ] **`location` field is display-only** — algorithms must not read it.
- [ ] **Thresholds: 98% / 51%** — the legal test.
- [ ] **Verdict formula and rounding** — every defence auditor must reproduce it.
- [ ] **`Graph` and `ContentResult` shapes** — L1 renders against these.
- [ ] **Registry schema** — `issuerId`, `publicKey`, `verified`.
- [ ] **Schema files marked extensible enough for future additive fields** — so privacy work (§2.9) fits without breaking compatibility.
- [ ] **Repo owner + access list** — admin issue, but it freezes too.

---

## 7. What to keep flexible — checklist (with reason)

Implementations below the contract boundary must stay swappable. Each item lists *why*.

- [ ] **Ed25519 library** — vetted libraries get deprecated; pin algorithm name, not vendor.
- [ ] **JSON Schema validator** — same; many implementations, same behaviour.
- [ ] **Trusted timestamp authority** — Canadian TSA choice may shift; isolate behind one function.
- [ ] **Identity method** — `did:key` (demo) vs. `did:web` (production). One key-resolution function.
- [ ] **Accreditation authority** — ISED vs. designated body; the credential issuer changes, the credential shape does not.
- [ ] **Transparency log implementation** — custom Merkle (demo) vs. Rekor / Trillian (production).
- [ ] **Mock data file** — `mock-drone.json` will be replaced at event time. Never hard-code `81`, never hard-code "drone".
- [ ] **Graph algorithm internals** — BFS vs. DFS vs. memoised recursion. Output is the `Graph` shape; how you produce it is local.
- [ ] **Graph renderer** — Cytoscape vs. React Flow vs. D3. Render against `Graph`, not a library-specific format. Event-day data may be any depth; never assume the 7-node drone layout.
- [ ] **Anomaly detection algorithm + features + threshold** — empirical; the `risk_score` field is advisory metadata, not contract.
- [ ] **LLM choice and prompt strategy** — for authoring, reconciliation, NL verifier. Model performance shifts monthly; swap freely. The schema validator is the gate, not the LLM.
- [ ] **Benchmark data sources** — StatsCan, CBSA, NAICS lookups; subject to API availability.
- [ ] **Privacy primitives** — Bulletproofs vs. alternative zk schemes; post-hackathon decision.
- [ ] **Demo script + pitch deck content** — evolves to the morning of.

The pattern: **every flexible item lives behind one function in one file.** If it takes more than a one-file change to swap, the boundary is in the wrong place.

---

## 8. The decision checklist for any new feature

For any new feature, ask these three questions in order:

1. **Does the output influence `verdict` or `reason`?**
   → Fixed workflow. No exceptions. Use the deterministic check set.

2. **Is there a vetted standard or library that already does this?**
   → Adopt it. The contract already mandates this for DSSE, Ed25519, JCS, JSON Schema, the Competition Bureau thresholds. Don't reinvent.

3. **Is the output human-facing or advisory** (drafts, queues, dashboards, NL answers)?
   → AI is fair game, **with two rails**:
   - (a) every fact cites the attestation or registry it came from;
   - (b) every AI proposal goes through a deterministic check before it becomes signed bytes.

If a feature can't pass these three questions, it does not ship.

---

## 9. Open items

- [ ] **Mass-balance check** — adopt from Maple Ledger §7.2 into v0.2 as an additive `BROKEN_LINK` sub-case? Recommend yes.
- [ ] **Transparency log in the demo** — Maple Ledger requires; v0.2 contract does not. Decide at 21 May meeting.
- [ ] **Activity enum** (Maple §6.1: `extract / refine / manufacture / ...`) vs. the v0.2 tier-only model. Recommend adding `activity` as an optional field — additive, never read by algorithms in v0.2, available for v1.
- [ ] **Encryption-at-rest of cost fields** — pin the *intent* in the schema now (optional `encryptedCosts` field) so future additive change is non-breaking.
- [ ] **Repo owner + access list.**

---

*Build the chain · Catch the forger · Look like we can ship — RedTeam DefTech Ottawa · 30 May 2026*
