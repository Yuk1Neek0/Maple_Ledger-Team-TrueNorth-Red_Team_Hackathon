# TrueNorth — Data Contract v0.2

> Single source of truth for the boundaries between the three work-lanes.
> Owned by Lane 3 (Data). Changing this file requires sign-off from all three lanes.

| | |
|---|---|
| Contract version | `0.2` |
| Status | DRAFT — editable until the **27 May** freeze |
| Freeze date | **27 May 2026** — after this, additive changes only (see §5.2) |
| Lanes | L1 Frontend/Demo · L2 Crypto engine · L3 Data/Graph/Algorithm |

---

## How to read this document — reading map

This contract is organised **by work-lane**. You only need to read your own lane's part,
plus the two shared parts.

| You are working on… | Read | You may skip |
|---|---|---|
| **Any lane** | **Part 1** (Common ground) + **Part 5** (Process) | — |
| **Lane 1** — Frontend / demo | + **Part 4** | Parts 2 & 3 internals |
| **Lane 2** — Crypto engine | + **Part 2** | Parts 3 & 4 internals |
| **Lane 3** — Data / graph / algorithm | + **Part 3** | Parts 2 & 4 internals |

Rule that holds everywhere: this contract defines **data shapes and function signatures
only** — never implementation. Each lane wraps these shapes in its own types and never
imports another lane's code.

---

# Part 1 · Common ground — everyone reads this

The shapes and enums in this part are the contract itself: all three lanes produce or
consume them, so all three must agree. Lane-specific detail lives in Parts 2–4.

## 1.1 The three lanes and the two boundaries

```
L3 ──── signed attestation (Envelope) ────> L2     (boundary A — §1.2)
(L3+L2) ──── results / graph ─────────────> L1     (boundary B — Parts 2 & 3 outputs)
```

| Lane | Owns | Exposes |
|---|---|---|
| **L1** Frontend/Demo | the three rooms, name, logo, all human-facing copy | nothing (consumes only) |
| **L2** Crypto engine | signing, verification, attack detection | `signAttestation` `verifyAttestation` `verifyChain` |
| **L3** Data/graph/algorithm | data model, provenance graph, Canadian-content math | `buildGraph` `computeCanadianContent` + ships the data files |

## 1.2 The Attestation — Statement + Envelope

One supplier contribution = one **attestation**. It has two layers:

- the **Statement** — the domain payload (cost, labour, location, links). Owned by L3.
- the **Envelope** — a DSSE wrapper carrying the Base64'd Statement + signature. Built by L2.

### The Statement (the signed payload)

```jsonc
// Statement — validated by statement.schema.json (Appendix). Owned by L3.
{
  "contractVersion": "0.2",
  "attestationId":   "att-0002",          // unique within a product
  "productId":       "drone-x1",           // which finished product this belongs to
  "tier":            2,                     // 0 = finished, 1 = subassembly, 2 = raw/parts
  "issuerId":        "sup-imu-import",      // must resolve in the registry (§1.3); also the keyid
  "inputs":          ["att-0001"],          // parent attestation ids — these are the DAG edges
  "contribution": {
    "description":        "IMU / flight sensor",
    "location":           "Imported",       // free-text, DISPLAY ONLY — never drives logic
    "performedInCanada":  false,             // the machine-readable Canadian-work flag
    "totalCostCents":     13000,             // cost incurred at THIS stage only, integer cents
    "canadianCostCents":  0,                 // portion of totalCostCents spent in Canada, integer
    "currency":           "CAD"              // fixed "CAD" for the demo
  },
  "nonce":     "9f3a1c7e",                  // random hex — makes every Statement's bytes unique
  "timestamp": "2026-05-30T10:15:00Z"       // ISO 8601, UTC, trailing "Z"
}
```

- **Money is integer cents.** `13000` = $130.00. No floats, no decimal-formatting rule;
  sums are exact.
- **Invariant:** `0 <= canadianCostCents <= totalCostCents`. Violation → `MALFORMED`.

### The Envelope (boundary A — what L3 hands to L2, and L2 hands on)

```jsonc
// Envelope — a DSSE envelope. Built/signed by L2 (§2.2). This is the unit on the wire.
{
  "payload":     "eyJ...",                                  // Base64( UTF-8 JSON of the Statement )
  "payloadType": "application/vnd.truenorth.attestation+json",
  "signatures": [
    { "keyid": "sup-imu-import", "sig": "base64..." }        // keyid = issuerId
  ]
}
```

Every lane handles **Envelopes** on the wire. To read the Statement, Base64-decode
`payload` and JSON-parse it (one shared helper, `decodeStatement(envelope)`).

## 1.3 The Identity Registry

A flat allow-list of pre-vetted suppliers. A signature is trusted only if its `keyid`
resolves here to a `verified: true` entry whose `publicKey` verifies the signature.

```jsonc
// registry.json — validated by registry.schema.json (Appendix). Owned by L3, used by L2.
{
  "registryVersion": "0.2",
  "suppliers": [
    {
      "issuerId":  "sup-imu-import",        // matches Statement.issuerId and Envelope keyid
      "name":      "Offshore Sensors Ltd.",
      "publicKey": "base64...",             // Ed25519 public key
      "verified":  true
    }
  ]
}
```

## 1.4 The two frozen enums

These strings are **frozen**: L1 writes its copy against them, L2 produces the first,
L3 produces the second.

### `reason` — integrity-check outcome (produced by L2, §2.6)

| value | meaning | demo attack |
|---|---|---|
| `OK` | passed every check | — |
| `MALFORMED` | fails JSON Schema or the §1.2 invariant | — |
| `SIGNATURE_INVALID` | DSSE signature does not verify — payload altered after signing | Tamper (01) |
| `UNKNOWN_ISSUER` | `keyid` not in registry / not `verified` / key does not verify the sig | Forge (02) |
| `REPLAY_DETECTED` | wrong `productId`, or duplicate `attestationId`/`nonce` | Replay (03) |
| `BROKEN_LINK` | dangling `inputs` id, duplicate id, or bad tier-0 count | — |
| `CYCLE_DETECTED` | `inputs` edges form a cycle | — |

### `verdict` — Canadian-content designation (produced by L3, §3.5)

| value | rule |
|---|---|
| `PRODUCT_OF_CANADA` | `percent >= 98` AND tier-0 work performed in Canada |
| `MADE_IN_CANADA` | `percent >= 51` AND tier-0 work performed in Canada |
| `NONE` | otherwise |

## 1.5 Versioning & freeze (summary — full rules in §5.2)

Every Statement carries `contractVersion`. Before **27 May** the structure may change
freely (bump the version, tell the other two). After 27 May: **additive only** — you may
add optional fields, never rename / remove / reorder / retype an existing field or enum
value.

---

# Part 2 · Lane 2 — Crypto engine

> Read Part 1 first. This part is everything the crypto lane needs and nothing else.

## 2.0 At a glance

| | |
|---|---|
| 🔧 **Adopt — do not build** | [DSSE](https://github.com/secure-systems-lab/dsse) envelope + PAE (§2.2) · [Ed25519 / RFC 8032](https://www.rfc-editor.org/rfc/rfc8032) · [SHA-256 / FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) · vetted Ed25519 library — [@noble/ed25519](https://github.com/paulmillr/noble-ed25519) |
| 🛠️ **Build yourself** | identity check (§2.3) · replay & product binding (§2.4) · structural integrity (§2.5) · failure taxonomy & precedence (§2.6) · the three exposed functions (§2.7) |
| ⚠️ **May shift on 27 May / event day** | the spec could name a different signature scheme, a different key/identity model, or extra attack classes (→ new `reason` codes). **Mitigation:** keep the algorithm name in one constant; make every integrity check its own function so a new one slots in; `reason` is an additive enum, so new codes append without breaking L1. |

## 2.1 What you build

Keys + identity verification, signing, single-attestation verification, and whole-chain
verification that catches tamper / forge / replay. This lane is the engine behind the
demo's headline 45 seconds.

## 2.2 Standards you adopt — do not design these

| Standard | Gives you | What you do |
|---|---|---|
| **[DSSE](https://github.com/secure-systems-lab/dsse)** — Dead Simple Signing Envelope | the signing envelope; **removes JSON canonicalization entirely** — you sign the exact transmitted bytes | wrap every Statement as an Envelope (§1.2); sign/verify per the PAE formula below |
| **[Ed25519](https://www.rfc-editor.org/rfc/rfc8032)** — RFC 8032 | the signature algorithm | `algorithm` fixed to `Ed25519`; use a vetted library ([`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519)); keys are 32-byte, Base64 in JSON |
| **[SHA-256](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf)** — FIPS 180-4 | fixed-length fingerprints | used only for key fingerprints / `keyid` if needed — **no manual DAG hash-chaining** |

**The one formula you implement** — DSSE Pre-Authentication Encoding (PAE). The
signature is over `PAE`, never over raw JSON:

```
PAE = "DSSEv1" SP LEN(payloadType) SP payloadType SP LEN(body) SP body
        SP        = one ASCII space (0x20)
        LEN(x)    = byte length of x, as a decimal ASCII string
        body      = the raw UTF-8 JSON Statement bytes (the thing that was Base64'd into payload)

sig    = Ed25519_sign(  PAE , privateKey )
verify = Ed25519_verify( PAE , sig , publicKey )
```

Because both sides Base64-decode the *same* `payload` string, they reconstruct identical
`body` bytes with zero coordination — no "did you sort the keys / escape the accent" risk.

## 2.3 Module — identity check

**Problem.** Tell a real supplier from a forged one.

**Solution.** Resolve the Envelope's `keyid` in the registry (§1.3). The check has **two
parts, both required:** (a) the key is present and `verified: true`; (b) *that same key*
verifies the signature. Either part failing → `UNKNOWN_ISSUER`.

## 2.4 Module — replay & product binding

**Problem.** A genuine, validly-signed attestation from another product is pasted in
(demo attack 03). Every signature check on it passes — it is real.

**Solution.** Binding is enforced at the **chain** level, not per-attestation:

- Each Statement carries `productId` **inside the signed payload**.
- `verifyChain` takes the product under verification as an explicit `productId` argument.
- Any attestation whose `productId` ≠ that argument → `REPLAY_DETECTED`.
- A duplicate `attestationId` **or** duplicate `nonce` within the set → `REPLAY_DETECTED`
  (catches the same attestation pasted twice). `nonce` exists so two otherwise-identical
  contributions never produce byte-identical Statements.

## 2.5 Module — structural integrity

**Problem.** Malformed or malicious structure can corrupt the verdict or crash L3.

**Solution.** `verifyChain` enforces, before trusting any result:

| Check | Failure reason |
|---|---|
| Document validates against the JSON Schema | `MALFORMED` |
| Every `inputs` id exists in the set | `BROKEN_LINK` |
| `inputs` edges form no cycle (self-reference included) | `CYCLE_DETECTED` |
| Every `attestationId` is unique within the product | `BROKEN_LINK` |
| Exactly one `tier: 0` attestation per product | `BROKEN_LINK` |

## 2.6 Module — failure taxonomy & precedence

You produce the `reason` enum (§1.4). When an attestation fails several checks, report
the **first** that applies, in this precedence order:

```
MALFORMED  →  SIGNATURE_INVALID  →  UNKNOWN_ISSUER  →  REPLAY_DETECTED
           →  BROKEN_LINK / CYCLE_DETECTED
```

## 2.7 Functions you expose (boundary A)

```
signAttestation(statement, privateKey) -> Envelope
    // serializes the Statement, Base64s it, signs PAE (§2.2), returns a DSSE Envelope

verifyAttestation(envelope, registry) -> VerifyResult
    // schema-validate -> verify DSSE signature -> resolve keyid in registry
    // checks ONE attestation in isolation

verifyChain(envelopes[], registry, productId) -> ChainResult
    // every attestation + structural integrity (§2.5) + replay (§2.4) for one product
```

```jsonc
// VerifyResult — consumed by L1
{ "attestationId": "att-0002", "valid": false, "reason": "SIGNATURE_INVALID" }

// ChainResult — consumed by L1
{
  "valid": false,
  "violations": [ { "attestationId": "att-0002", "reason": "UNKNOWN_ISSUER" } ]
}
```

## 2.8 Stub strategy

Before the real engine exists, ship `verifyChain` returning a hard-coded `ChainResult`
so L1 can build the auditor room. Swap in the real function at integration.

---

# Part 3 · Lane 3 — Data / graph / algorithm

> Read Part 1 first. This part is everything the data lane needs and nothing else.

## 3.0 At a glance

| | |
|---|---|
| 🔧 **Adopt — do not build** | [JSON Schema 2020-12](https://json-schema.org/specification) for validation (§3.2) · [Competition Bureau of Canada](https://competition-bureau.canada.ca/en/how-we-foster-competition/education-and-outreach/publications/product-canada-and-made-canada-claims) thresholds for the legal test (§3.2) |
| 🛠️ **Build yourself** | the Statement data model (§1.2) · the provenance DAG / `buildGraph` (§3.3) · the Canadian-content algorithm (§3.4) · verdict mapping (§3.5) · the `performedInCanada` predicate (§3.6) · mock data + attack fixtures (§3.7) |
| ⚠️ **May shift on 27 May / event day** | the 27 May spec is likely to redefine direct-cost categories, tier depth, or the exact percentage formula; event-day data replaces `mock-drone.json` wholesale. **Mitigation:** never hard-code `81` or any drone number; keep the cost fields and the `%` formula parameterized; keep the data file fully swappable behind `buildGraph` / `computeCanadianContent`. |

## 3.1 What you build

The JSON data model, the multi-tier provenance graph, the Canadian-content algorithm,
the verdict, and the mock data + attack fixtures. You also **own this contract file**
and the JSON Schemas. You ship first — the other two lanes wait on your day-1 files.

## 3.2 Standards you adopt — do not design these

| Standard | Gives you | What you do |
|---|---|---|
| **[JSON Schema](https://json-schema.org/specification)** 2020-12 | "is this data valid?" answered by a validator, not by humans | ship `statement.schema.json` + `registry.schema.json` (Appendix); a document that fails validation is `MALFORMED` |
| **[Competition Bureau of Canada](https://competition-bureau.canada.ca/en/how-we-foster-competition/education-and-outreach/publications/product-canada-and-made-canada-claims)** — *"Product of Canada" and "Made in Canada" Claims* guidelines | the exact legal test | map the thresholds 1:1 in §3.5 |

The legal rule, verbatim from the source:

- **Product of Canada** — last substantial transformation in Canada **and** ≥ **98%** of
  total **direct costs** incurred in Canada.
- **Made in Canada** — last substantial transformation in Canada **and** ≥ **51%** of
  total direct costs in Canada (plus a qualifying statement about imported content).

Source: `https://competition-bureau.canada.ca/en/how-we-foster-competition/education-and-outreach/publications/product-canada-and-made-canada-claims`

## 3.3 Module — the multi-tier provenance DAG

**Problem.** Attestations must link across tiers into a chain of custody.

**Solution.** Each Statement's `inputs` array lists the `attestationId`s it consumes —
these are the **edges** of a directed acyclic graph (inputs → consumer). Tamper-evidence
is **per-node**: every attestation is independently DSSE-signed, so altering any node
breaks *that node's* signature. No manual hash-chaining.

```jsonc
// Graph — produced by buildGraph(), consumed by L1
{
  "nodes": [
    {
      "attestationId":  "att-0002",
      "label":          "IMU / flight sensor",
      "tier":           2,
      "subtreePercent": 0,        // rolled-up Canadian % of this node + everything feeding it
      "status":         "OK"      // a §1.4 reason string, for node colouring
    }
  ],
  "edges": [
    { "from": "att-0001", "to": "att-0002" }   // input -> consumer
  ]
}
```

`buildGraph` must carry a visited-set guard so a cycle cannot make it loop forever.

## 3.4 Module — the Canadian-content algorithm

**Problem.** Compute one defensible Canadian-content percentage for a product.

**Solution.**

```
totalCostCents    = Σ contribution.totalCostCents     over all attestations
canadianCostCents = Σ contribution.canadianCostCents  over all attestations
percent           = round( canadianCostCents / totalCostCents * 100 )    // integer
```

**Critical semantic — `totalCostCents` is the MARGINAL cost added at this stage**: this
stage's own materials + labour, **excluding** the cost of inputs it consumed. Each tier
reports only what it added, so summing all stages gives the true product total with no
double-counting.

> Worked example (the 81% demo drone): the seven stages' `totalCostCents` sum to
> `69000` ($690.00); `canadianCostCents` sum to `56000` ($560.00);
> `percent = round(56000 / 69000 * 100) = 81`.

`subtreePercent` (graph colouring) = the same ratio over the **de-duplicated set** of
attestations transitively reachable through `inputs` from that node.

```jsonc
// ContentResult — produced by computeCanadianContent(), consumed by L1
{
  "percent":           81,
  "totalCostCents":    69000,
  "canadianCostCents": 56000,
  "verdict":           "MADE_IN_CANADA"
}
```

## 3.5 Module — the verdict mapping

**Problem.** Turn the percentage into the legal designation.

**Solution.** Implements §3.2 directly. "Last substantial transformation in Canada" =
the **tier-0 attestation's `performedInCanada` flag** (§3.6). Produces the `verdict`
enum (§1.4).

## 3.6 Module — the Canadian-ness predicate

**Problem.** "Was this stage's work done in Canada" drives a legal verdict, so it cannot
rest on free-text parsing — a place name string is not a reliable predicate.

**Solution.** Split the concern in two:

- `contribution.location` — free text, **display only**. Never read by any algorithm.
- `contribution.performedInCanada` — a **boolean**, the single machine-readable source of
  truth. `buildGraph`, `verdict`, and all Canadian-content logic read **only** this flag.

## 3.7 Module — mock data & attack fixtures

**Problem.** Nobody can build or demo without sample data; the demo needs the three
attacks pre-canned.

**Solution.** Ship `mock-drone.json` **on day 1**:

```jsonc
{
  "contractVersion": "0.2",
  "registry":     { /* §1.3 */ },
  "attestations": [ /* Envelopes — the honest 81% drone, ~7 nodes */ ],
  "attacks": {
    "tamper": [ /* IMU totalCostCents 13000 -> 1300, signature untouched -> SIGNATURE_INVALID */ ],
    "forge":  [ /* extra attestation signed with an unregistered key   -> UNKNOWN_ISSUER     */ ],
    "replay": [ /* another product's genuine attestation pasted in     -> REPLAY_DETECTED    */ ]
  }
}
```

## 3.8 Functions you expose (boundary B)

```
buildGraph(envelopes[]) -> Graph                       // §3.3
computeCanadianContent(envelopes[]) -> ContentResult   // §3.4 + §3.5
```

## 3.9 Files you ship

`mock-drone.json` · `registry.json` · `statement.schema.json` · `registry.schema.json`
(schemas in the Appendix). Deliver the mock data + schemas on day 1.

## 3.10 Stub strategy

Before the real algorithm exists, ship `computeCanadianContent` returning the fixed 81%
`ContentResult` so L1 can build the purchaser room. Swap in the real function at
integration.

---

# Part 4 · Lane 1 — Frontend / demo

> Read Part 1 first. This part is everything the frontend lane needs and nothing else.

## 4.0 At a glance

| | |
|---|---|
| 🔧 **Adopt — do not build** | [React](https://react.dev) for the UI · a DAG/graph visualization library — [React Flow](https://reactflow.dev) / [D3](https://d3js.org) · [in-toto](https://github.com/in-toto/attestation) as the standard cited in the pitch (§4.3) |
| 🛠️ **Build yourself** | the three rooms (§4.1) · visual identity — name & logo · copy keyed off the enums (§4.4) · the demo script (§4.5) |
| ⚠️ **May shift on 27 May / event day** | the event-day scenario may not be a drone and may have any tier depth / node count. **Mitigation:** the graph view must render *any* DAG from the `Graph` data — never a fixed 7-node drone layout; all status copy reads enum strings (§1.4), never hard-codes "drone" or a specific number. |

## 4.1 What you build — the three rooms

| Room | Deliverable | What it does |
|---|---|---|
| **Supplier room** | A | A verified supplier issues a signed attestation — materials, labour, location, cost. |
| **Purchaser room** *(the focus)* | B + C | Enter a product → provenance graph + Canadian-content % + verdict. |
| **Auditor / Red-team room** | D | Inspect the trust chain node by node; forgeries flag red. |

Plus the product name, logo, visual identity, and running the demo (incl. the live
triple-attack — the highest-scoring 45 seconds).

## 4.2 What you consume — you expose no data API

| You call | From | You get | Defined in |
|---|---|---|---|
| `signAttestation` | L2 | an `Envelope` | §2.7 |
| `verifyAttestation` / `verifyChain` | L2 | `VerifyResult` / `ChainResult` | §2.7 |
| `buildGraph` | L3 | `Graph` | §3.8 |
| `computeCanadianContent` | L3 | `ContentResult` | §3.8 |

You build the three rooms against L2/L3 **stubs** (§2.8, §3.10), then swap in the real
functions at integration. To display attestation contents, Base64-decode `payload` and
JSON-parse it (the shared `decodeStatement` helper).

## 4.3 The standard you cite — for the pitch

**[in-toto Attestation Framework](https://github.com/in-toto/attestation)** (Linux
Foundation) is the industry pattern for signed, identity-bound supply-chain claims. TrueNorth's
Envelope → Statement design follows it. In the pitch, say *"our provenance model follows
the in-toto attestation pattern"* — a real standard to cite reads as senior, and signals
we did not reinvent the wheel.

## 4.4 Copy keyed off the enums

All human-facing status text is driven by the two frozen enums in §1.4:

- `reason` (§1.4) → the red-alert copy in the auditor room and per-node colouring.
- `verdict` (§1.4) → the headline designation in the purchaser room.

Write copy against the **exact enum strings** — they will not change after the freeze.

## 4.5 Demo

Own the on-stage run: honest drone → 81% → the three attacks each rejected with their
`reason`, while the percentage never moves. Rehearse ×3.

---

# Part 5 · Process — everyone reads this

## 5.1 Stub strategy (so nobody blocks on anybody)

- **Day 1:** L3 delivers `mock-drone.json` + the two schemas. L1 and L2 start at once.
- L2 ships a stubbed `verifyChain`; L3 ships a stubbed `computeCanadianContent`. L1
  builds all three rooms against stubs and swaps in the real functions at integration.

## 5.2 Versioning & freeze

- Every Statement carries `contractVersion`. Bump it on any structural change.
- **Before 27 May:** structure may change freely — bump the version, ping the other two.
- **After 27 May (freeze):** *additive only* — you may ADD optional fields to the
  Statement or Envelope. You may NOT rename, remove, reorder, or retype an existing
  field, or change an enum value.
- Changing this file = open a PR; all three approve before merge. Code PRs need no gate.
- If the 27 May technical spec forces a change, add optional fields only.

## 5.3 Open items for the 21 May meeting

- [ ] Sign off on adopting DSSE (§2.2) — confirms canonicalization is not our problem.
- [ ] Confirm the §1.2 Statement field set — all structural fields land before the freeze.
- [ ] Confirm the `reason` (§1.4) and `verdict` (§1.4) enums — L1 copy depends on them.
- [ ] Confirm `verifyChain` takes an explicit `productId` argument (§2.4).
- [ ] Assign lanes to people (L1 / L2 / L3).
- [ ] Name the repo owner; everyone gets access today.

---

# Appendix — JSON Schemas (Lane 3 ships these as files)

```jsonc
// statement.schema.json  (JSON Schema 2020-12)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TrueNorth Attestation Statement",
  "type": "object",
  "required": ["contractVersion","attestationId","productId","tier",
               "issuerId","inputs","contribution","nonce","timestamp"],
  "additionalProperties": false,
  "properties": {
    "contractVersion": { "const": "0.2" },
    "attestationId":   { "type": "string", "pattern": "^att-[0-9]+$" },
    "productId":       { "type": "string" },
    "tier":            { "type": "integer", "minimum": 0, "maximum": 2 },
    "issuerId":        { "type": "string" },
    "inputs":          { "type": "array", "items": { "type": "string" } },
    "contribution": {
      "type": "object",
      "required": ["description","location","performedInCanada",
                   "totalCostCents","canadianCostCents","currency"],
      "additionalProperties": false,
      "properties": {
        "description":       { "type": "string" },
        "location":          { "type": "string" },
        "performedInCanada": { "type": "boolean" },
        "totalCostCents":    { "type": "integer", "minimum": 0 },
        "canadianCostCents": { "type": "integer", "minimum": 0 },
        "currency":          { "const": "CAD" }
      }
    },
    "nonce":     { "type": "string", "pattern": "^[0-9a-f]+$" },
    "timestamp": { "type": "string", "format": "date-time" }
  }
}
```

```jsonc
// registry.schema.json  (JSON Schema 2020-12)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TrueNorth Identity Registry",
  "type": "object",
  "required": ["registryVersion","suppliers"],
  "additionalProperties": false,
  "properties": {
    "registryVersion": { "const": "0.2" },
    "suppliers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["issuerId","name","publicKey","verified"],
        "additionalProperties": false,
        "properties": {
          "issuerId":  { "type": "string" },
          "name":      { "type": "string" },
          "publicKey": { "type": "string" },
          "verified":  { "type": "boolean" }
        }
      }
    }
  }
}
```

---

*Build the chain · Catch the forger · Look like we can ship — TrueNorth · RedTeam DefTech Ottawa · 30 May 2026*
