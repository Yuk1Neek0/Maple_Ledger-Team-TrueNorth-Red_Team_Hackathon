# TrueNorth — Data Contract

> Single source of truth for the boundaries between the three work-lanes.
> Owned by Lane 3 (Data). Any change requires sign-off from all three.

| | |
|---|---|
| Contract version | `0.1` (draft — to be confirmed at the 21 May meeting) |
| Status | DRAFT — editable until 27 May spec drop |
| Freeze date | **27 May 2026** — after this, additive changes only (see §2) |
| Lanes | L1 Frontend/Demo · L2 Crypto engine · L3 Data/Graph/Algorithm |

---

## 1. How to read this document

This file defines **data shapes and function signatures only** — never implementation.
Each lane wraps these shapes in its own types and never imports another lane's code.

The two boundaries this contract covers:

```
L3 ──── attestation JSON ────> L2        (boundary A — §3, the fragile one)
(L3+L2) ── results / graph ──> L1        (boundary B — §6)
```

---

## 2. Versioning & change rules

- Every attestation carries `core.contractVersion`. Bump it on ANY structural change.
- **Before 27 May:** structure may change freely; just bump the version and ping the other two.
- **After 27 May (freeze):** *additive only* — you may ADD optional fields to `core` or
  `envelope`. You may NOT rename, remove, reorder, or retype an existing field.
  Reason: a rename/reorder silently invalidates every signature already produced (§4).
- Changing this file = open a PR. All three approve before merge. Code PRs need no such gate.

---

## 3. The Attestation object  *(boundary A)*

One supplier contribution = one attestation. Split into two layers:

- **`core`** — the signed payload. Frozen hardest. One byte change → signature breaks.
- **`envelope`** — produced by L2 (the crypto layer). May evolve independently of `core`.

```jsonc
{
  // ===== SIGNED CORE — owned by L3, the exact bytes L2 signs over =====
  "core": {
    "contractVersion": "0.1",
    "attestationId":   "att-0002",          // unique within a product
    "productId":       "drone-x1",          // which finished product this belongs to
    "tier":            2,                   // 0 = finished, 1 = subassembly, 2 = raw/parts
    "issuerId":        "sup-imu-import",     // must resolve in the identity registry (§5)
    "inputs":          ["att-0001"],         // parent attestation ids — these are the DAG edges
    "contribution": {
      "description":   "IMU / flight sensor",
      "location":      "Imported",          // free text; "<Province>, CA" marks Canadian work
      "totalCost":     130.00,              // cost incurred at THIS stage, 2 decimals, CAD
      "canadianCost":  0.00,                // portion of totalCost spent in Canada, 2 decimals
      "currency":      "CAD"                // fixed "CAD" for the demo
    },
    "nonce":     "9f3a1c7e",                // random per attestation — anti-replay
    "timestamp": "2026-05-30T10:15:00Z"     // ISO 8601, UTC, always trailing "Z"
  },

  // ===== ENVELOPE — owned by L2, filled at signing time =====
  "envelope": {
    "algorithm":   "Ed25519",               // signature scheme
    "publicKey":   "base64...",             // issuer public key, must match registry entry
    "payloadHash": "sha256:abc123...",       // SHA-256 of the canonical core bytes (§4)
    "signature":   "base64..."              // signature over payloadHash
  }
}
```

**Invariant:** `0 <= canadianCost <= totalCost`. L3 enforces it when generating data;
L2 may treat a violation as an integrity failure.

---

## 4. Canonicalization rule  *(read this twice)*

`payloadHash` and `signature` are computed over the **canonical serialization of `core`**.
L2 and L3 MUST both serialize `core` exactly this way, or signatures will not verify:

1. Serialize `core` as JSON with **keys sorted lexicographically** at every level.
2. **No insignificant whitespace** (no spaces, no newlines).
3. **UTF-8** encoding.
4. All monetary fields rendered with **exactly two decimals** (`130.00`, never `130` or `130.0`).
5. Then: `payloadHash = "sha256:" + hex(SHA256(canonicalBytes))`.

> The `envelope` is NEVER part of the signed bytes. Only `core`.

---

## 5. Identity registry  *(boundary A, shared by L2 & L3)*

A flat list of verified suppliers. L2 uses it to decide "known issuer" vs "forged".

```jsonc
{
  "registryVersion": "0.1",
  "suppliers": [
    {
      "issuerId":  "sup-imu-import",
      "name":      "Offshore Sensors Ltd.",
      "publicKey": "base64...",             // L2 trusts a signature only if pubkey matches here
      "verified":  true
    }
  ]
}
```

An attestation whose `envelope.publicKey` is absent here → `UNKNOWN_ISSUER`.

---

## 6. Function signatures  *(boundary B)*

Each lane exposes exactly these functions. Inputs/outputs are the contract;
internals are free. Naming shown language-neutral — adapt to JS/TS as-is.

### Lane 2 — Crypto engine

```
signAttestation(core, privateKey) -> envelope
    // produces a complete envelope for an unsigned core

verifyAttestation(attestation, registry) -> VerifyResult
    // checks one attestation in isolation

verifyChain(attestations[], registry) -> ChainResult
    // checks the whole product: every attestation + replay across the set
```

```jsonc
// VerifyResult
{
  "valid":  false,
  "reason": "HASH_MISMATCH"    // one of the enum below
}

// ChainResult
{
  "valid": false,
  "violations": [
    { "attestationId": "att-0002", "reason": "UNKNOWN_ISSUER" }
  ]
}
```

**`reason` enum — frozen. L1 writes its red-alert copy against these exact strings:**

| value | meaning | demo attack |
|---|---|---|
| `OK` | passed | — |
| `HASH_MISMATCH` | core content no longer matches its signature | Tamper (01) |
| `UNKNOWN_ISSUER` | publicKey not in registry / does not chain to verified id | Forge (02) |
| `REPLAY_DETECTED` | nonce or productId binding reused | Replay (03) |
| `BROKEN_LINK` | an `inputs` id references a missing attestation | — |

### Lane 3 — Data / graph / algorithm

```
buildGraph(attestations[]) -> Graph
    // turns the flat attestation list into nodes + edges via core.inputs

computeCanadianContent(attestations[]) -> ContentResult
    // the verdict — see algorithm below
```

```jsonc
// Graph — what L1 renders as the provenance DAG
{
  "nodes": [
    {
      "attestationId": "att-0002",
      "label":         "IMU / flight sensor",
      "tier":          2,
      "subtreePercent": 0,        // rolled-up Canadian % of this node + everything feeding it
      "status":        "OK"       // mirrors VerifyResult.reason, for node coloring
    }
  ],
  "edges": [
    { "from": "att-0001", "to": "att-0002" }   // from input -> consumer
  ]
}

// ContentResult
{
  "percent":      81,                  // integer, rounded
  "totalCost":    690.00,
  "canadianCost": 560.00,
  "verdict":      "MADE_IN_CANADA"      // enum below
}
```

**`verdict` enum — frozen:**

| value | rule |
|---|---|
| `PRODUCT_OF_CANADA` | `percent >= 98` AND final assembly (tier 0) in Canada |
| `MADE_IN_CANADA` | `percent >= 51` AND final assembly (tier 0) in Canada |
| `NONE` | otherwise |

### Lane 1 — Frontend

Consumes everything above. Exposes no data API; owns name, logo, and the three rooms.

---

## 7. The Canadian-content algorithm

```
totalCost    = sum( core.contribution.totalCost )    over all attestations
canadianCost = sum( core.contribution.canadianCost ) over all attestations
percent      = round( canadianCost / totalCost * 100 )
```

`subtreePercent` on each node (for graph coloring only) = the same ratio computed over
that node plus every attestation transitively reachable through its `inputs`.

> Compute on **cost**, not "value" — see deck slide 04. The legal test is cost-based.

---

## 8. Mock data file  *(L3 delivers day 1)*

L3 ships `mock-drone.json` immediately so L1 and L2 can build without waiting:

```jsonc
{
  "contractVersion": "0.1",
  "registry":     { /* §5 */ },
  "attestations": [ /* §3 — the honest 81% drone, ~7 nodes */ ],
  "attacks": {
    // each is a tampered copy of `attestations` — feed to verifyChain, expect a violation
    "tamper":  [ /* IMU cost 130.00 -> 13.00, signature untouched   -> HASH_MISMATCH  */ ],
    "forge":   [ /* extra attestation signed with an unregistered key -> UNKNOWN_ISSUER */ ],
    "replay":  [ /* another product's genuine attestation pasted in   -> REPLAY_DETECTED */ ]
  }
}
```

---

## 9. Integration / stub strategy

So nobody blocks on anybody:

- **Day 1:** L3 delivers `mock-drone.json`. L1 and L2 start immediately against it.
- **Stubs:** before the real engine exists, L2 ships `verifyChain` returning a hard-coded
  `ChainResult`; L3 ships `computeCanadianContent` returning the fixed 81%. L1 builds the
  three rooms against stubs, swaps them for the real functions at integration.
- **Contract changes** go through a PR (§2). Code changes do not — push freely.
- **Freeze 27 May.** If the real spec forces a change, ADD optional fields only (§2).

---

## 10. Open items for the 21 May meeting

- [ ] Confirm `core` field set and the `core`/`envelope` split.
- [ ] Confirm canonicalization rule (§4) — both L2 and L3 must agree byte-for-byte.
- [ ] Confirm the `reason` and `verdict` enums.
- [ ] Assign lanes to people (L1 / L2 / L3).
- [ ] Name the repo owner; everyone gets access today.
```
