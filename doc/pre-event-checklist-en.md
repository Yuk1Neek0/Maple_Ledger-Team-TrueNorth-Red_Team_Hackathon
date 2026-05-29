# Pre-Event Build Checklist — what to do before 30 May

> Companion to `dev-milestones.md`. It sorts every milestone into lanes by **how much we can build before the full spec drops at kickoff on 30 May**.
>
> **The one rule that decides the lane:** anything that lives *behind the adapter boundary* — i.e. on our own internal model, our own thresholds, our own UI shapes — can be built now. Only the act of plugging the real spec in (and the four genuine unknowns) waits for the day.
>
> Lanes:
> - **A — Finish on mock data.** Logic built and tested before 5.30. On the day it only needs real data flowing through it; no rewrite expected.
> - **B — Skeleton now, swap insides on the day.** The flow is built against our own keys / plumbing; a known piece gets replaced at kickoff.
> - **C — Day-of, or pluggable.** The irreducible event-day work, plus the seams we deliberately leave swappable.
>
> **Lane 0 is the foundation** (M0.1–M0.7, listed first below): pre-event groundwork that unblocks everything. The keystone is **M0.3 — the internal node model**: get it right and Lanes A/B are safe to pre-build; get it wrong and you pre-built the wrong thing.

---

## Lane 0 — Foundation (do these first; all pre-event, unblock everything)

Phase 0 groundwork from `dev-milestones.md`. None of it depends on the event-day spec. **M0.3 is the keystone** — the internal model every other lane builds on.

- [ ] **M0.1 — Stack lock + environments running** ⚪🟩
      Everyone can `docker compose up` and see a hello-world page. Stack frozen: Python + FastAPI + SQLite, React + Tailwind + Cytoscape.js, pyca/cryptography, Claude API.
      *Done when:* every teammate has pulled the repo and run it once.

- [ ] **M0.2 — Repo skeleton + 6 adapter stubs** ⚪🟩
      Folder layout + the six stub functions returning mock data: `validate`, `canonicalize`, `verify`, `resolveKey`, `getCosts`, `findLastST`. Freeze the **signatures** now (see Lane C).
      *Done when:* the stubs exist, return mock data, and the rest of the code can call them.

- [ ] **M0.3 — Internal node model + adapter contracts** ⚪🟨 — *the keystone*
      Our in-memory representation of an attestation + the graph (not the wire format). Include an optional `annotations` area for overlay data.
      *Done when:* a one-page class diagram exists and the team agrees on it.

- [ ] **M0.4 — Verification algorithm flowchart** ⚪🟨
      The whole decision on paper: schema → signature → registry → structural → mass-balance → compute % → verdict, with the precedence order and every named rejection reason.
      *Done when:* it covers all five test categories and the three verdicts.

- [ ] **M0.5 — Hand-written mock data** ⚪🟩
      3–5 attestations by hand: one clean happy-path chain + at least one tamper case. This feeds every Lane-A test.
      *Done when:* the happy-path chain produces a known percentage by hand-calculation.

- [ ] **M0.6 — UI shells + QR scan proven in browser** ⚪🟨
      Bare React shells for both rooms. Crucially: get **QR scanning working in a real browser today** — camera APIs need HTTPS/localhost and behave differently per browser (the classic silent half-day loss).
      *Done when:* a phone or webcam scans a QR code into the purchaser shell.

- [ ] **M0.7 — De-risk spikes** ⚪🟩
      Two throwaway tests: (1) Cytoscape renders a 5-node graph in React; (2) a Claude API hello-world call returns.
      *Done when:* both spikes succeed and the API key works.

---

## Lane A — Finish completely before 30 May (on mock data)

Spec-independent logic. Build it, test it against hand-written mock chains, assert against hand-calculated answers. On 5.30 these consume real adapter output unchanged.

- [ ] **M2.2 — Chain walk / build the graph** 🔴P0 · *DESIGN §3, §4*
      Flat list → DAG, follow input references, **guard cycles**, produce a topological order. Pure internal logic; touches no spec field.
      *Done when:* a multi-tier mock chain builds a correct node/edge graph with no infinite loops.

- [ ] **M2.3 — Canadian-content math (the arithmetic core)** 🔴P0🟥 · *DESIGN §10, milestone M2.3*
      Sum cost by country in **integer cents**, compute `percent`, apply the **98 / 51 thresholds** (known now, Competition Bureau), assemble the verdict. Include the **substantial-transformation gate** in the verdict (both conditions required).
      *Hand-calculate one worked example and assert against it — this is the silent-bug zone.*
      *Done when:* the mock chain returns the exact expected percentage and verdict.
      *Note:* the **cost-flow / partial-consumption rule** and **how ST is identified** are NOT here — they live in Lane C (`getCosts`, `findLastST`). Build the engine around stubs for those.

- [ ] **M3.1 — Structural checks + precedence engine** 🟠P1 · *DESIGN §7, §9*
      Our `reason` enum + its fixed precedence (`MALFORMED → SIGNATURE_INVALID → UNKNOWN_ISSUER → REPLAY_DETECTED → BROKEN_LINK/CYCLE`). Broken-link, cycle, duplicate output-serial, monotonic-timestamp checks — all on the internal model.
      *Done when:* each test category returns the correct reason code in the correct order. (Reason *strings* may be renamed by the spec — cosmetic, behind the enum.)

- [ ] **M3.2 — Mass-balance check** 🟠P1🟥 · *DESIGN §9*
      Accumulate consumed-quantity per node, compare against produced-quantity. Algorithm is ours; quantity field names sit behind the adapter.
      *Done when:* a deliberately over-claimed mock chain is rejected; a balanced one passes.
      *Decision needed:* is overdraw a hard reject (milestone M3.2) or an advisory flag (DESIGN §7)? **Pick one before building.** Recommend hard reject.

- [ ] **M3.3 — Anomaly detection (advisory)** 🟠P1 · *milestone M3.3*
      IsolationForest / PyOD plausibility score, 0–1, on features we define (cost vs regional norm). **Fully spec-independent** — uses our features + external StatsCan/NAICS data.
      *Advisory only — never alters the verdict.* This is the most genuinely finishable-now item.

- [ ] **M4.2 — Purchaser room UI** 🟡P2 · *DESIGN §6.2, §11*
      Verdict card (percent · label · flags) + provenance graph, rendered against our **locked `VerificationResult` and `Graph` shapes** with mock data. Colour nodes by reason-code status.
      *Prereq:* **QR scanning already proven in a real browser (M0.6) — do this first, it's the classic half-day silent loss.*
      *Day-of:* point it at the live backend (a one-line base-URL swap).

- [ ] **M4.1 — Supplier room UI (shell + flow)** 🟡P2 · *DESIGN §6.1*
      Form → schema-validate → human-confirm → sign → submit, against our mock schema and test keys.
      *Day-of:* remap form fields to the real schema (Lane C seam). The flow itself is done now.

- [ ] **M6.1 — Demo script + attack scenarios (draft)** 🟡P2
      Rehearsed narrative for the three live attacks (tamper / forge / replay) + the anomaly demo, on mock data. Finalize the exact numbers on the day.

- [ ] **M6.3 — Pitch deck** 🟡P2
      Build now (see `build-priority-plan-en.html`). Only the final live numbers / demo recording wait for the day.

---

## Lane B — Build the skeleton now, swap the insides on the day

The flow is real and testable pre-event; one well-isolated piece is replaced at kickoff.

- [ ] **M2.1 — Signature + schema verification** 🔴P0 · *DESIGN §2, §6*
      **Now:** build the whole pipeline — `validate → verify signature → resolve key → check registry` — using our own Ed25519 test keys and mock schema.
      **Swap on the day:** the real **reference library** (the verify primitive), the real **canonical serialization** (DSSE vs JCS), the real **registry format**. All three are adapter calls (`verify`, `canonicalize`, `resolveKey`).
      *Done when (pre-event):* a valid mock attestation passes, a tampered one returns `SIGNATURE_INVALID`.

- [ ] **M6.2 — Docker Compose + internal self-test** 🔴P0 · *DESIGN §12*
      **Now:** Compose project, service names, ports, `/health`, and **our own** internal test harness over the mock chains.
      **Swap on the day:** run against the **provided official self-test harness** (only exists at kickoff). Confirm our service name / port / run command match the spec exactly.

---

## Lane C — Do on the day, or make pluggable (the swap points)

This is the irreducible event-day work. We don't pre-build it — we pre-build *around* it, behind the six adapter functions, so the day is mechanical translation, not design.

- [ ] **M1.0 — Adapter translation vs the real spec** 🔴P0 · *the day-of critical path, do first*
      Open the spec at kickoff; rewrite only the **insides** of the six adapters. Do not touch their signatures. Swap mock data for the provided sample chains.
      *Done when:* the provided sample chain flows end-to-end through the (already-built) pipeline.

### The 6 pluggable seams — freeze the signature now, fill the body on the day

> These are the *only* places the event-day spec touches our code. Everything in Lanes A/B calls these and nothing else.

- [ ] `validate(obj) → Result` — swap in the **real JSON schema** file.
- [ ] `canonicalize(obj) → bytes` — **DSSE / JCS / custom**; this is the exact signing input.
- [ ] `verify(bytes, sig, key) → bool` — call the **provided reference library** (never our own crypto).
- [ ] `resolveKey(keyid) → publicKey` — read the **provided registry** shape.
- [ ] `getCosts(att) → CostBreakdown` — map real cost fields → **integer cents**; encodes the **cost-flow / partial-consumption rule**.
- [ ] `findLastST(chain) → Attestation` — implement whatever the spec's **substantial-transformation rule** turns out to be.

### The 4 unknowns to confirm at kickoff (don't bet on these in advance)

- [ ] **How "substantial transformation" is identified** from attestation data — the single biggest unknown. (Isolated in `findLastST`.)
- [ ] **Cost-flow / partial-consumption** weighting rule across tiers. (Isolated in `getCosts` + the math engine's parameters.)
- [ ] **Canonical serialization** — is it DSSE/PAE, or plain JCS? (Decides `canonicalize`; if DSSE, our `SHA-256(JCS(payload))` assumption is wrong.)
- [ ] **Real field names + registry format + the official self-test interface.**

---

## How the lanes hand off on 5.30 morning

If Lanes A and B are done on mock data before the event, the ideal day-of sequence is short:

1. **M1.0** — fill the 6 adapter bodies + confirm the 4 unknowns (~1–2 hrs if the boundary was designed well).
2. The already-built pipeline (Lane A + B) lights up on the **real sample chain**.
3. Wire the UIs (Lane A) to the live backend (base-URL swap).
4. Package + run the official self-test (Lane B → M6.2), then submit.

Everything else was already built. **The prep window is the real work; the day is translation.**

---

*RedTeam DefTech Ottawa · 30 May 2026 · TrueNorth · companion to dev-milestones.md & DESIGN.md*
