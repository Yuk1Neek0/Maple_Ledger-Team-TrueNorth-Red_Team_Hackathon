# Development Milestones — Plain-English Build Plan

> A milestone-by-milestone plan, sorted by **importance** (what wins the score and the room) and annotated with **difficulty** (how hard each piece is to build). Written so anyone on the team — backend, frontend, or the person writing the pitch — can follow what we're building and why.
>
> **The event is a single day: 30 May 2026, at Bayview Yards, Ottawa. It starts and ends that day.** The build happens in two parts:
> - **Part 1 — Before 5.30:** everything we can prepare in advance. This is where most of the real work must happen.
> - **Part 2 — On 5.30:** the full technical spec drops at kickoff; we translate it into our scaffolding and build the system to submission in **about 5 hours, start to finish.**
>
> The "72 hours" in earlier docs referred to when guidance arrives *before* the event — **not** a 72-hour build. There is no Day 2 or Day 3. Plan accordingly.
>
> Companion to `build-adopt-ai-plan.md` (roles: AI vs fixed code) and `build-priority-plan-en.html` (the slide version of the priority tiers).

---

## How to read this

Every milestone carries two tags:

**Importance** — why we build it, and in what order:

| Tag | Meaning |
|---|---|
| 🔴 **P0** | The scored core. The harness grades this directly. If this is wrong, nothing else matters. |
| 🟠 **P1** | Also scored. Catching manipulated data + the graph. |
| 🟡 **P2** | Required deliverable, **not** harness-scored, but it carries the live demo. |
| 🟢 **P3** | Bonus. Pure demo/pitch flair. Only after everything above works. |
| ⚪ **Setup** | Groundwork that unblocks everything else. |

**Difficulty** — how hard it is to build:

| Tag | Meaning |
|---|---|
| 🟩 Easy | A few hours. Boilerplate or a library call. AI can mostly write it. |
| 🟨 Medium | Half a day to a day. Needs design thought + testing. |
| 🟥 Hard | The risky, subtle work. Bugs here are silent. A human must verify by hand. |

---

## The three golden rules

1. **Build what's scored. Polish what's demoed. Cut what's neither.**
   P0 + P1 win the harness. P2 carries the room. P3 is the encore.

2. **On the day, work the critical path in strict priority order — and never start P3 until the core passes its "Done when".**
   The bonus is the bonus, not the wage. Earn the wage first. *(This governs day-of triage and the P3 gate. In the prep window before 5.30, lanes run in parallel — P0/P1/P2 logic is all built on mock data; see `pre-event-checklist-en.md`.)*

3. **Design what we own; don't guess what the organizer dictates.**
   What arrives only at kickoff: the attestation wire-schema, the registry format, the signing/serialization rules, **how "substantial transformation" is identified**, and **the cost-flow / partial-consumption rule** — the last two are the most dangerous, because they change the verdict. Our internal model, our algorithm, and our adapters are ours — design those now, and isolate every unknown behind the six adapters (see `pre-event-checklist-en.md`).

---

## Timeline at a glance

### Part 1 — Before 5.30 (the prep window — *build as much as humanly possible here*)

**Not just Phase 0 scaffolding.** The baseline: *everything behind the adapter boundary is built and tested on mock data before the event.* Whatever is spec-independent gets implemented now; only the spec translation and the day-of unknowns wait. The exact before / skeleton / on-the-day split is the lane model in `pre-event-checklist-en.md` — this table is the summary.

| Built before 5.30 | Milestones | On what |
|---|---|---|
| **Phase 0 — Get ready** | M0.1–M0.7 | Skeleton, 6 adapter stubs, internal model, flowchart, UI shells, QR-in-browser, de-risk spikes |
| **Phase 2 logic (P0)** | M2.2, M2.3 | Chain walk / graph + content math & verdict — on mock data, hand-calc asserted |
| **Phase 3 logic (P1)** | M3.1, M3.2, M3.3 | Structural + precedence, mass-balance, anomaly scoring — on mock data |
| **Phase 4 (P2)** | M4.1, M4.2 | Supplier + purchaser rooms wired to a mock backend |
| **Skeletons** | M2.1, M6.2 | Signature/schema verify with our own keys; Compose + internal self-test |
| **Demo prep** | M6.1, M6.3 | Demo script draft, pitch deck |

### Part 2 — On 5.30 (single competition day, ~5 hours)

The day is **translate → swap → wire → submit**, not build-from-scratch — because Part 1 already built the logic on mock data. Strict priority order on the critical path; never start P3 until the core passes (golden rule 2).

| Order | On the day | Focus |
|---|---|---|
| 0 | **Read the spec** | Full schema, registry, reference library, sample data drop at the start |
| 1 | **Translate (M1.0)** | Fill the 6 adapter bodies + confirm the 4 unknowns — blocks everything, first and fast |
| 2 | **Swap insides** | Real reference lib / serialization / registry into M2.1; the pre-built pipeline lights up on the real sample chain |
| 3 | **Wire interfaces (P2)** | Point the pre-built UI shells at the live backend (a base-URL swap) |
| 4 | **Ship (Phase 6)** | Re-run self-test, Docker Compose, submit — leave a hard stop for this |
| last | **Bonus (P3)** | Only if a lane finishes early |

> **Lanes run in parallel in both windows.** Critical path on the day: *translate → pipeline lights up → wire UI → package → submit.* With only ~5 hours, **assume you will not reach P3 at all** — the goal is a correct, packaged, submitted P0+P1 with a working demo. **If Part 1 was done well, the day is mostly mechanical.**

---

## Master milestone table

| # | Milestone | Importance | Difficulty | Owner |
|---|---|---|---|---|
| M0.1 | Stack lock + environments running | ⚪ Setup | 🟩 Easy | All |
| M0.2 | Repo skeleton + 6 adapter stubs | ⚪ Setup | 🟩 Easy | Lane 2 |
| M0.3 | Internal node model + adapter contracts | ⚪ Setup | 🟨 Medium | Lane 3 |
| M0.4 | Verification algorithm flowchart | ⚪ Setup | 🟨 Medium | Lane 3 |
| M0.5 | Hand-written mock data | ⚪ Setup | 🟩 Easy | Lane 2 |
| M0.6 | UI shells + **QR scan proven in browser** | ⚪ Setup | 🟨 Medium | Lane 1 |
| M0.7 | De-risk spikes (Cytoscape, Claude API) | ⚪ Setup | 🟩 Easy | Lane 1/3 |
| M1.0 | Adapter translation vs real spec | 🔴 P0 | 🟨 Medium | Lane 2 |
| M2.1 | Signature + schema verification | 🔴 P0 | 🟨 Medium | Lane 2 |
| M2.2 | Chain walk / build the graph | 🔴 P0 | 🟨 Medium | Lane 3 |
| M2.3 | **Canadian content math + verdict** | 🔴 P0 | 🟥 Hard | Lane 3 |
| M3.1 | Structural checks + precedence order | 🟠 P1 | 🟨 Medium | Lane 2 |
| M3.2 | Mass-balance check | 🟠 P1 | 🟥 Hard | Lane 3 |
| M3.3 | Anomaly detection | 🟠 P1 | 🟨 Medium | Lane 3 |
| M4.1 | Supplier room (issue + sign) | 🟡 P2 | 🟨 Medium | Lane 1 |
| M4.2 | Purchaser room (QR + verdict + graph) | 🟡 P2 | 🟨 Medium | Lane 1 |
| M5.1 | Conversational authoring | 🟢 P3 | 🟨 Medium | Lane 1 |
| M5.2 | Natural-language verifier | 🟢 P3 | 🟨 Medium | Lane 1/2 |
| M5.3 | Strategic-criticality overlay | 🟢 P3 | 🟩 Easy | Lane 3 |
| M5.4 | Reconciliation report (single example) | 🟢 P3 | 🟩 Easy | Lane 3 |
| M6.1 | Demo script + attack scenarios | 🟡 P2 | 🟨 Medium | All |
| M6.2 | Docker Compose final + self-test pass | 🔴 P0 | 🟨 Medium | Lane 2 |
| M6.3 | Pitch deck + rehearsal | 🟡 P2 | 🟨 Medium | All |

---

# Phase 0 — Get ready (the foundation · all before 5.30)

**Goal:** be ready to *plug in* on event day, not ready to *design* on event day. Everything here is behind the adapter boundary, so the unknown event-day spec can't invalidate it. **Because the build is a single day, this prep window is not optional padding — it is where most of the system gets designed.** Whatever isn't scaffolded before 5.30 will be rushed on 5.30.

### M0.1 — Stack lock + environments running ⚪ 🟩
**What:** Everyone can run `docker compose up` and see a hello-world page. Stack is frozen: Python + FastAPI + SQLite, React + Tailwind + Cytoscape.js, Claude API, pyca/cryptography.
**Why it matters:** A teammate who can't run the project on Day 1 is a teammate lost for half a day. This is the cheapest, highest-leverage thing we do.
**Done when:** Every person has pulled the repo and run it once.

### M0.2 — Repo skeleton + 6 adapter stubs ⚪ 🟩
**What:** Create the folder layout and six stub functions that return fake data:
`validate`, `canonicalize`, `verify`, `resolveKey`, `getCosts`, `findLastST`.
**Why it matters:** These six functions are the only places the event-day spec touches our code. Everything else is built on top of them. Freezing their *signatures* now means Day-1 morning is translation, not redesign.
**Done when:** The stubs exist, return mock data, and the rest of the code can call them.

### M0.3 — Internal node model + adapter contracts ⚪ 🟨
**What:** Design *our* representation of an attestation in memory and in the graph — not the organizer's wire format, but how we store and traverse it after parsing. Include an optional `annotations` area for overlay data (see M5.3).
**Why it matters:** As LAXMAN put it — pick the wrong structure and you'll fight the data forever. This is ours to get right, and it sits behind the adapter, so the spec can't break it.
**Done when:** A one-page class diagram exists and the team agrees on it.

### M0.4 — Verification algorithm flowchart ⚪ 🟨
**What:** A flowchart of the whole verification decision: schema check → signature → registry → structural → mass-balance → compute % → verdict, with the precedence order and every named rejection reason.
**Why it matters:** This is the highest-value prep we can do without the spec. It lets us *test the logic on paper* before any code exists, and it doubles as a pitch artifact.
**Done when:** The flowchart covers all five test categories and the three verdicts.

### M0.5 — Hand-written mock data ⚪ 🟩
**What:** 3–5 attestations by hand, covering one clean happy-path chain and at least one tamper case.
**Why it matters:** Lets us build and test the whole pipeline before real sample data arrives.
**Done when:** The happy-path chain produces a known percentage by hand-calculation.

### M0.6 — UI shells + QR scan proven in browser ⚪ 🟨
**What:** Bare React shells for the supplier and purchaser rooms. Crucially: get **QR scanning working in a real browser** today.
**Why it matters:** Browser camera APIs need HTTPS or localhost and behave differently per browser. This is the single most common silent half-day loss in this kind of project. Prove it early.
**Done when:** A phone or webcam scans a QR code into the purchaser shell.

### M0.7 — De-risk spikes ⚪ 🟩
**What:** Two tiny throwaway tests: (1) Cytoscape renders a 5-node graph in React; (2) a Claude API "hello world" call returns.
**Why it matters:** Each of these can eat half a day if discovered late. Find the problems now.
**Done when:** Both spikes succeed and the API key works.

---

# The build — Phases 1–6 (grouped by phase, not by clock)

> **Definitions vs scheduling.** The milestones below (M1–M6) are grouped by phase and priority — that's *what each is and how important it is*. Their *scheduling* follows `pre-event-checklist-en.md`: the spec-independent **logic** of Phases 2–4 is built **before 5.30 on mock data** (Lane A/B). What genuinely happens *on the day* is narrower — translate the spec into the adapters (M1.0), swap the real crypto/registry into M2.1, wire the UI shells to the live backend, then package and submit. Read each milestone below as "the work it defines," not "work that only starts on 5.30."

# Phase 1 — Translate

*When — **on the day** (Lane C): the irreducible spec-plugging; do it first, it blocks everything.*

### M1.0 — Adapter translation vs real spec 🔴 🟨
**What:** The full spec drops at kickoff. Open it and rewrite the *insides* of the six adapters to match: real field names, real serialization, real registry format, real cost fields, the real "substantial transformation" rule. Don't change the adapter signatures. Swap mock data for the provided sample chains.
**Why it matters:** This is the highest-risk work of the whole day, and it blocks everything downstream — so it goes first. If the adapter boundary was designed well in Phase 0, this is mechanical translation. If not, it's a redesign under time pressure you don't have.
**Done when:** The provided sample chain flows through the pipeline and the self-test harness runs (even if the score is low).
**Watch out:** The "substantial transformation" rule is defined *here*, for the first time. Our Phase-0 assumption (a flag on the final node) may be wrong — confirm it against the spec before trusting the verdict.

---

# Phase 2 — The scored core (P0) — "Can a buyer trust it?"

*When — **logic built before 5.30 on mock data** (M2.2/M2.3 Lane A, M2.1 Lane B skeleton); the real reference lib / serialization / registry swap in on the day.*

This is what the harness grades first. Get it right before anything else.

### M2.1 — Signature + schema verification 🔴 🟨
**What:** For each attestation: validate against the schema (reject `MALFORMED`), then verify the signature using the **event-day reference library** (never our own crypto).
**Why it matters:** A chain is only as trustworthy as its weakest signature. This is the foundation every later check stands on.
**Done when:** A valid attestation passes; a tampered one returns `SIGNATURE_INVALID`.

### M2.2 — Chain walk / build the graph 🔴 🟨
**What:** Turn the flat list of attestations into a graph by following each record's references to the ones it consumed. Guard against cycles.
**Why it matters:** The math and the visual both need this structure. Get the traversal right and the rest is summation.
**Done when:** A multi-tier sample chain produces a correct node/edge graph with no infinite loops.

### M2.3 — Canadian content math + verdict 🔴 🟥
**What:** Sum the costs across the chain, divide to get the percentage, apply the 98% / 51% thresholds (verbatim from the Competition Bureau), and check the last substantial transformation is in Canada. Money is **integer cents, never floats**.
**Why it matters:** This is the #1 scored deliverable and the part a court could audit. It must be pure, reproducible arithmetic — **no AI anywhere near it**.
**Difficulty note:** This is Hard not because the formula is complex, but because the multi-tier weighting, rounding, and partial-consumption rules have *silent* bugs. A passing test only proves the test was right. **Hand-calculate at least one worked example and assert against it.**
**Done when:** The sample chain returns the exact expected percentage and verdict from the provided answer key.

---

# Phase 3 — Catch the forger (P1) — "What if the data lies?"

*When — **built before 5.30 on mock data** (Lane A): the reason codes, precedence, mass-balance and anomaly scoring are all ours.*

The second scored dimension. Two halves: deterministic checks (crypto for integrity) and probabilistic scoring (AI for plausibility).

### M3.1 — Structural checks + precedence order 🟠 🟨
**What:** Implement the named rejections and a fixed order to apply them:
`MALFORMED → SIGNATURE_INVALID → UNKNOWN_ISSUER → REPLAY_DETECTED → BROKEN_LINK / CYCLE`.
**Why it matters:** These map one-to-one to the primer's test categories. The harness will throw manipulated chains at us and check we return the *right* reason for the *right* failure.
**Done when:** Each of the five test categories produces the correct reason code, in the correct precedence.

### M3.2 — Mass-balance check 🟠 🟥
**What:** Verify that the quantity consumed downstream never exceeds the quantity produced upstream. Closes the "over-claim" attack.
**Why it matters:** This is a category the primer calls out explicitly, and it's the one attack where every signature is valid but the numbers still don't add up. A genuine differentiator.
**Difficulty note:** Hard because it requires accumulating quantities across the graph correctly — easy to double-count. Test with a deliberately over-claimed chain.
**Done when:** An over-consuming chain is rejected; a balanced one passes.

### M3.3 — Anomaly detection 🟠 🟨
**What:** Score each attestation 0–1 for plausibility (e.g. labour cost vs. regional norm) using IsolationForest / PyOD. Output is **advisory** — it queues a record for review, it never changes the verdict.
**Why it matters:** The second scored dimension, and the cleanest 30 seconds on stage: a valid signature, a 0.94 risk score, the auditor queue lighting up. This is "crypto for integrity, AI for plausibility" made visible.
**Done when:** An inflated-cost attestation gets a high score while keeping a valid signature.

---

# Phase 4 — The interfaces (P2) — "Required, and they carry the demo"

*When — **built before 5.30 against a mock backend** (Lane A); pointed at the live backend on the day (a base-URL swap).*

Not harness-scored, but a broken demo sinks the pitch. On the day this is *wiring*, not building — the shells were made in Phase 0, so Lane 1 connects them to the live backend as it comes online.

### M4.1 — Supplier room (issue + sign) 🟡 🟨
**What:** A form where a supplier fills in their contribution, it's validated against the schema, and they sign and submit.
**Why it matters:** Shows the full attestation lifecycle — the "where claims come from" half of the story.
**Done when:** A supplier can create and submit a valid, signed attestation through the UI.

### M4.2 — Purchaser room (QR + verdict + graph) 🟡 🟨
**What:** Scan a product's QR code, look it up, and show the verdict card (percentage, label, flags) plus the provenance graph, all readable by a non-technical user.
**Why it matters:** This is the "focus" room — the moment a procurement officer trusts or rejects a product in 30 seconds.
**Done when:** Scanning a QR shows the correct verdict and a colour-coded graph.

---

# Phase 5 — Bonus (P3) — "Only if you're ahead"

*When — **on the day, only if a lane finishes early** (the P3 gate, golden rule 2).*

Zero harness points. Pure demo and pitch. **Do not touch until the core passes the happy path + all five test categories.** On a single-day event, be honest: you will probably not reach these. Pick *at most one* (M5.2 or M5.3) if a lane finishes early, and keep it small.

### M5.1 — Conversational authoring 🟢 🟨
**What:** Supplier types "we milled 50 airframes, 3 machinists × 6 hrs at $42/hr" and the LLM drafts the structured attestation. Human reviews and signs.
**Why it matters:** Demo gold — shows AI as accelerator, not authority.

### M5.2 — Natural-language verifier 🟢 🟨
**What:** "Which components trace back to one foreign sub-supplier?" → the LLM turns it into a deterministic graph query → answers with attestation IDs as citations. Numbers come from the math, never the model.
**Why it matters:** The highest-ROI demo feature — the moment judges remember.

### M5.3 — Strategic-criticality overlay 🟢 🟩
**What:** After verification, annotate each component with a strategic lens — `componentClass` (critical / standard / commodity) and value-add. **Lives in our overlay layer, not in the signed attestation, and never alters the legal verdict.**
**Why it matters:** Answers the likely judge pushback — "is cost % really the most meaningful metric for defence?" — without muddying the legal, cost-based answer. (This is CHEICK's idea, placed correctly.)
**Done when:** The purchaser view shows the legal verdict *and* a separate criticality view.

### M5.4 — Reconciliation report (single example) 🟢 🟩
**What:** One hard-coded "external import record" example + an LLM-drafted comparison report.
**Why it matters:** Strong defence-procurement story. **Don't build the real pipeline — the harness gives us nothing to reconcile against.**

---

# Phase 6 — Ship

*When — demo script & deck **drafted before 5.30** (M6.1/M6.3); Compose + internal self-test **skeletoned before** (M6.2 Lane B); final package + the **official** self-test run on the day.*

Leave a hard stop for this near the end. A working submission that scores beats a brilliant one that never got packaged. Start packaging while the last features are still landing.

### M6.1 — Demo script + attack scenarios 🟡 🟨
**What:** A rehearsed script that runs the three live attacks (tamper, forge, replay) plus the anomaly demo, and shows the percentage never moving.
**Why it matters:** The highest-scoring 45 seconds of the pitch.

### M6.2 — Docker Compose final + self-test pass 🔴 🟨
**What:** The whole system runs with one `docker compose up`, and the self-test harness passes its representative cases.
**Why it matters:** If it doesn't run the way the harness expects, the score is zero regardless of how good the code is.
**Done when:** A clean checkout runs and self-tests pass.

### M6.3 — Pitch deck + rehearsal 🟡 🟨
**What:** Final deck, demo narrative, and at least one full run-through.
**Why it matters:** A great system with a fumbled pitch loses to a good system with a clean one.

---

## The risk map — where things go wrong

| Risk | Phase | Mitigation |
|---|---|---|
| QR scan broken in browser | M0.6 | Prove it **before 5.30** — there's no spare hour on the day |
| Adapter boundary designed wrong → Day-1 redesign | M1.0 | Spend Phase 0 getting the six signatures right |
| Silent bug in the cost math | M2.3 | Hand-calculate a worked example; assert against it |
| "Substantial transformation" rule guessed wrong | M1.0 | Confirm against the spec before trusting the verdict |
| Mass-balance double-counting | M3.2 | Test with a deliberately over-claimed chain |
| Bonus work started too early | Phase 5 | Golden rule #2 — core passes first |
| Nobody can debug AI-written code at 2 AM | All | Each lane owns its code well enough to fix it fast |

---

## One-paragraph summary for the team

The event is **one day**. Before 5.30 we build everything we *own* — the internal model, the verification flowchart, the six adapters, working UI shells, an end-to-end pipeline running on mock data — and de-risk the things that silently eat time (QR scanning, Cytoscape, the API key). Whatever isn't scaffolded by then gets rushed on the day, so the prep window is the real work. On 5.30 the full spec drops at kickoff; Lane 2 translates it into our adapters first while the other lanes keep moving, then we build outward in strict priority order on the critical path — scored core (verify + math + verdict), then catching forgers (integrity + mass-balance + anomaly), then wiring the pre-built interfaces — leaving a hard stop near the end to package and submit. With only ~5 hours, assume the bonus AI flair stays unbuilt. Build what's scored, polish what's demoed, cut what's neither — and on a single day, finish beats fancy.

---

# Appendix — Everything else from `build-adopt-ai-plan` (coverage check)

A full sweep of `build-adopt-ai-plan.md`. The milestones above cover the build *work*; this section captures everything in the plan that is **not** its own milestone — principles, contract elements, sub-checks, AI features, the cut pile, and admin — so nothing falls through the cracks.

### A. Principles that govern every milestone (plan §1, §4, §8)
- **Crypto for integrity, AI for plausibility.** If an output influences the `verdict` or any `reason` code, it is fixed workflow — no AI in that path, ever. (§1.1)
- **Lock the boundary, not the body.** Freeze interfaces / enums / shapes among the lanes; keep implementations swappable. (§1.2)
- **The four things AI never does:** (1) sign attestations, (2) compute the legal verdict, (3) be the source of truth for any fact, (4) participate in the cryptographic verification path. (§4)
- **The 3-question test for any new feature:** Does it touch `verdict`/`reason`? → fixed workflow. Is there a vetted library? → adopt it. Is it advisory / human-facing? → AI is fine, with citations + a deterministic gate. (§8)

### B. Internal contract elements to keep consistent across lanes (the "Lock" rows, adapted)
These were "lock by 27 May" in the plan; on a single-day build they're the internal contracts the lanes must agree on so integration doesn't break.
- `reason` enum **and** its fixed precedence order
- `verdict` enum strings (`PRODUCT_OF_CANADA` / `MADE_IN_CANADA` / `NONE`)
- envelope shape (`payload`, `payloadType`, `signatures[]`) + the **PAE signing input** (the one and only thing signed)
- `performedInCanada` (boolean) — the **only** machine-readable Canadian-work signal
- `location` is **display-only** — never parsed by any algorithm
- money is **integer cents**, never floats; `0 ≤ canadianCostCents ≤ totalCostCents`
- the `Graph` and `ContentResult` shapes the UI consumes
- registry shape: `issuerId`, `publicKey`, `verified`
- schema stays **extensible** — optional additive fields tolerated (`activity`, `encryptedCosts`, `rangeProof`)
- product name + enum-keyed copy strings (rename = silent breakage)

### C. Standards / libraries referenced but not their own milestone (plan §2, §5)
- **DSSE** — signing envelope (from the event-day reference library); avoids JSON-canonicalization foot-guns
- **Ed25519** via `pyca/cryptography` — the verify primitive
- **SHA-256** — content addressing of each attestation (the linking mechanism)
- **RFC 8785 JCS** — canonical JSON, *only if* the spec is not using DSSE
- **JSON Schema 2020-12** — `MALFORMED` rejection
- **ULID** — attestation IDs
- **in-toto Attestation Framework** — cite in the pitch as the pattern we follow
- **IsolationForest / PyOD**, **XGBoost / LightGBM** — anomaly models
- **StatsCan wage data + NAICS**, **CBSA imports** — anomaly / reconciliation data
- **Anthropic Claude API** — authoring assistant, NL verifier, reconciliation
- *Keep-flexible note (§7):* the Ed25519 library, schema validator, TSA, anomaly model, LLM, graph renderer, and mock-data file all live behind a single adapter/function — swapping any is a one-file change.

### D. Deterministic checks folded inside larger milestones — don't forget them
Each lives inside an M2.x / M3.x milestone; listed here so none is silently dropped.
- credential chain check to the accreditation root (part of M2.1)
- revocation check against the revocation registry (M2.1)
- **"two parts both required"** — key present + `verified: true`, *and that same key* verifies the signature → else `UNKNOWN_ISSUER` (M2.1 / M3.1)
- output-serial uniqueness — one `(issuerId, output serial)` pair only (M3.1)
- timestamps monotonic along input → output (M2.2 / M3.1)
- `subtreePercent` per node — the Canadian % for each subtree, not just the root (M2.3)

### E. AI features in the plan beyond the four demo placements
All advisory; build only if time (most won't be reached on a ~5-hour day).
- supplier **Mode 2 — document-upload extraction** (invoice / BoM / payroll → draft Statement) (§2.7)
- supplier **Mode 3 — API ingestion**, no AI in the path (§2.7)
- **graph risk analysis / wash-ring detection** — offline batch, never alters a node's status (§2.3)
- **plain-English node explanation** in the auditor room — beside the `reason` code, never instead of it (§2.8)

### F. The cut pile — in the plan, deliberately NOT built on a single day
Keep these in the pitch as "production roadmap"; spend zero build-hours on them.
- W3C **DIDs** / **Verifiable Credentials** (§2.1) — the registry is mocked; just look up the key
- **FIDO2 / WebAuthn / GCKey / HSM / YubiKey** hardware signing (§2.1, §2.7) — software signing is enough
- **Transparency log** (Sigstore Rekor / Trillian / custom Merkle), STH, inclusion / consistency proofs, STH gossip (§2.4) — not in primer scope
- **RFC 3161 trusted timestamps** (§2.2) — only *verify* one if the schema includes the field; build no TSA
- **Privacy / selective disclosure** — Bulletproofs, Shamir / threshold decryption, encrypt-at-rest, quorum reveal, PIPEDA (§2.9)
- **Signed verification certificate** (§2.8) — optional end-of-day polish only

### G. Admin & open items (plan §9)
- **repo owner + access list** — settle before 5.30
- **`activity` enum** (`extract / refine / manufacture / …`) — treat as optional additive; algorithms don't read it
- **transparency log in the demo** — decided NO for the single-day build
- **encryption-at-rest of cost fields** — pin schema-extensibility intent only; build nothing

---

*RedTeam DefTech Ottawa · 30 May 2026 · TrueNorth*
