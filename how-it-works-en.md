# How TrueNorth Works — In Plain English

> A non-technical walk-through of what the system does, what the words "encryption" / "private key" / "public key" mean, and how all the pieces fit together step by step.
>
> Audience: teammates, judges, procurement officers, anyone who hasn't built software like this before. No prior knowledge assumed.

---

## 1. The problem we're solving

The Government of Canada's **Buy Canadian Policy** prefers Canadian-made products in defence procurement. Two official labels exist:

- **Product of Canada** — at least 98% of the cost was incurred in Canada.
- **Made in Canada** — at least 51% of the cost was incurred in Canada.

The catch: today, those labels rely on **the supplier saying so**. There is no way to check.

A drone has dozens of parts. Each part has its own suppliers. Each of those has *their* suppliers. By the time a finished drone is sold to the Canadian Armed Forces, the paper trail goes through five companies, three countries, and four accounting systems. Reconstructing where every dollar was actually spent — and proving none of the records have been quietly edited — is impossible with paper.

**What we build** answers three questions for any product, with cryptographic proof:

1. Does this product qualify as **Made in Canada** or **Product of Canada**?
2. **What percentage** of its value is Canadian?
3. Can the record be **independently verified** end-to-end?

---

## 2. The three building blocks you need to understand

Before the workflow, three concepts. Everything else is built from these.

### 2.1 The fingerprint (a "hash")

If you take any document — a paragraph, a spreadsheet, a JSON file — and run it through a fingerprinting machine, you get a short tag like `sha256:9c1f...e3`. This tag has three magical properties:

- **The same document always produces the same fingerprint.**
- **A different document — even by one comma — produces a completely different fingerprint.**
- **You cannot work backwards from a fingerprint to guess the original document.**

So a fingerprint is a way to say "I'm talking about *this exact* document and no other" in 64 characters. If anyone changes the document later, the fingerprint will no longer match — and we'll notice.

### 2.2 The personal seal (public key + private key)

Imagine each supplier has a special wax-seal stamp.

- The **private key** is the physical stamp. The supplier keeps it locked in a safe (or, for high-security suppliers, on a hardware device that nobody can copy). Only they can press it.
- The **public key** is a photograph of what their seal looks like, published openly. Everyone in the world has a copy.

Now:

- **Signing.** When the supplier wants to vouch for a document, they press their stamp on it. This produces a "signature" — a piece of data that says *this exact document* was sealed by *this exact stamp*.
- **Verifying.** Anyone — a procurement officer, an auditor, a journalist, even a competing supplier — can hold the signed document up against the published photograph of the seal, and confirm: yes, this signature could *only* have been made by the holder of that private key.

This is the most important property in the whole system:

> **You can prove the supplier signed it without ever seeing or holding their private key.**

If anyone changes the document after the seal is pressed, the seal no longer matches. If anyone tries to forge a seal without the private key, the forgery is mathematically detectable.

### 2.3 The signed claim (an "attestation")

An **attestation** is one small data record that says:

> *"I am Apex Machining in Mississauga, Ontario. On 20 May 2026 I machined one drone airframe from 0.42 kg of Rio Tinto's 6061 billet. I spent $412 on Canadian labour, $38.50 on Canadian materials, $0 on foreign anything. The work happened at facility fac-mis-001. Signed: Apex Machining."*

It's just a small JSON file (a few lines of structured text). What makes it powerful is that:

- The information is structured the same way for every supplier (so a computer can read it).
- It carries a **signature** from the supplier's private key (so we know it's really them).
- It carries a **fingerprint** of every upstream attestation it depended on (so we can trace where the raw material came from).

One supplier contribution = one attestation. That's it.

---

## 2.4 All three blocks together — a worked example

Let's run a real scene through all three blocks, with actual values.

### The scene

**20 May 2026, 14:33 — Mississauga, Ontario.** Apex Machining has just finished machining one drone airframe out of 0.42 kg of Rio Tinto's 6061 aluminum billet. The work cost $412 in Canadian labour and $38.50 in Canadian consumables. Apex's signing officer, Sarah, sits down at her laptop with a YubiKey plugged in.

### Step 1 — The statement (just text)

Sarah types into the Apex supplier portal: *"We machined one RAVEN-7C airframe from 0.42 kg of Rio Tinto 6061 billet. Three machinists, two hours. $412 labour, $38.50 consumables, all Canadian."*

The AI assistant drafts the structured attestation. Sarah checks it line by line. Here's the final text:

```json
{
  "attestationId": "01HX5J7K9P2QR4ZTBN8VWGCFHM",
  "issuer":        "apex-machining-ca",
  "activity":      "manufacture",
  "output":        "RAVEN-7C airframe #00471",
  "inputs":        ["sha256:b2c44e91...  (the Rio Tinto billet)"],
  "labour_CA":     412.00,
  "labour_FOR":      0.00,
  "materials_CA":   38.50,
  "materials_FOR":   0.00,
  "location":      "Mississauga, ON, CA",
  "timestamp":     "2026-05-20T14:33:00Z"
}
```

This is just **text**. No magic yet. It's editable. Sarah could change any number.

### Step 2 — Block 1 in action: the fingerprint

Sarah's laptop runs the text through SHA-256. Out pops a 64-character tag:

```
input text  →  sha256:9c1f8b2e4a73d5e6f8a1b9c2d4e7f0a3b5c8d1e4f7a9c2b5e8d1f4a7c0b3e6d9
```

Two things matter:

- This tag is now the **identity** of that exact text. Same text anywhere in the world → same tag.
- If Sarah typed `$413` instead of `$412`, the tag would be completely different — something like `sha256:71d440aa8e23c5f9...`. There is no "small change → small change" in fingerprints. Every change is a total change.

### Step 3 — Block 2 in action: Apex's keys

Apex has two keys, generated months ago when they were accredited:

| Key | Lives | Looks like |
|---|---|---|
| **Private key** | Inside the YubiKey hardware. **Cannot be exported, copied, or extracted** — not even by Sarah herself. The chip will sign things on request, but never reveals the key itself. | (never seen by anyone) |
| **Public key** | Published in the accreditation registry the day Apex was approved. Anyone in the world can download it. | `MCowBQYDK2VwAyEA9c1f8b2e4a73d5e6f8a1b9c2d4e7f0a3=` |

The accreditation registry, which is just a publicly readable file, contains an entry like:

```json
{
  "issuerId":  "apex-machining-ca",
  "name":      "Apex Machining Inc.",
  "publicKey": "MCowBQYDK2VwAyEA9c1f8b2e4a73d5e6f8a1b9c2d4e7f0a3=",
  "verified":  true
}
```

### Step 4 — Block 3 in action: signing

Sarah's laptop sends the fingerprint (`9c1f8b2e...`) to the YubiKey. The YubiKey beeps; Sarah taps it.

Inside the YubiKey, Ed25519 math runs the fingerprint together with the private key. Out comes a **signature** — a different 64-byte blob that looks like:

```
signature  =  RZ3kP2nL8fX4mQwR7tY1pK9sL0jD5xN6qF2vC8bM4hG1aE7zU3wQ
                yT6oR5iK4nB7vP0sJ2xM8cL1fA9qZ3rT5wY8iH6dK2bN4oG7eP=
```

The signature is sent back to Sarah's laptop. **The private key never left the YubiKey.**

### Step 5 — The bundle that goes out

Apex's portal now packages everything together:

```json
{
  "statement":  "<the text from Step 1>",
  "signature":  "RZ3kP2nL...eP=",
  "keyId":      "apex-machining-ca"
}
```

This bundle is the **signed attestation**. It gets stored, and its fingerprint is added to the chain that will eventually represent the finished drone.

---

### Now — anyone verifies it

A procurement officer in Ottawa opens the Verifier Portal three weeks later. They want to confirm Apex's attestation is real. Their software runs four checks, with no human help needed:

| # | Check | What happens |
|---|---|---|
| 1 | Look up `apex-machining-ca` in the registry | Finds Apex's entry, `verified: true`, public key `MCow...` |
| 2 | Re-compute the fingerprint of the statement text | Gets `9c1f8b2e4a73...` — same tag Sarah's laptop got, because the math is the same everywhere |
| 3 | Ed25519-verify the signature against (fingerprint, public key) | Math returns ✓ — the signature could only have been produced by the holder of the private key that matches `MCow...`. That's Apex. |
| 4 | Check structural integrity (no replay, links resolve, no cycles) | All clean |

Verdict: **valid**. The procurement officer now trusts that:
- Apex really wrote this claim (Block 2 — the signature is real).
- Nobody has edited the claim since signing (Block 1 — the fingerprint matches).
- The claim is well-formed and links into the chain properly (Block 3 — the attestation passes structural checks).

---

### What happens when someone tampers

Three weeks later, a malicious actor breaks into the storage server. They edit Apex's stored attestation to inflate the Canadian percentage: they change `"labour_CA": 412.00` to `"labour_CA": 4120.00`.

Next time anyone verifies the chain:

| Check | Result |
|---|---|
| 1 — Registry lookup | ✓ Apex still in registry |
| 2 — Re-compute fingerprint of statement | **Tag is now `sha256:71d440aa...` — totally different from the original** |
| 3 — Ed25519-verify signature against new fingerprint | ✗ **FAILS** — the signature was made over the *original* fingerprint. It does not verify against the new one. |
| 4 — Structural integrity | (we don't even get here) |

The verifier rejects the attestation with `SIGNATURE_INVALID`. The Canadian-content percentage never moves, because the verifier refuses to include this attestation in the math.

**Notice:** the attacker had full access to the storage server. They didn't need to break any crypto. They just changed text. The system caught them anyway — because the signature was made over the original text's fingerprint, and you can't make a new valid signature without the private key, which is sitting in a YubiKey on Sarah's desk.

That's the whole magic, in one example.

---

## 3. How one supplier creates a signed claim — step by step

Walk through it slowly. Five steps.

| Step | What happens | Plain language |
|---|---|---|
| 1 | Supplier fills in the claim | "I, Apex Machining, made one airframe. Cost breakdown: …" |
| 2 | The claim is turned into a clean, ordered text file | So every computer in the world produces the same bytes from the same facts |
| 3 | The fingerprint of that text is computed | A 64-character tag — different by one comma, different tag |
| 4 | The supplier presses their **private key** stamp onto the fingerprint | Produces a signature — a few hundred bytes of data |
| 5 | The claim + the signature are sent off together | This bundle is the attestation |

The supplier's private key never leaves their device. The signature is just a math output — it carries no secret.

> **What the AI helps with here:** the supplier doesn't write JSON by hand. They type "*we milled 50 airframes, 3 machinists at $42/hr for 6 hours each*" and an AI assistant drafts the structured claim. The supplier reads it, edits anything wrong, then signs. The AI never touches the private key, and the signing step is always done by a human pressing a button on a hardware device.

---

## 4. How anyone can verify the claim — step by step

The verifier could be a procurement officer, an auditor, a journalist, or just another supplier curious about the chain. They don't need anyone's permission to check.

| Step | What happens | Plain language |
|---|---|---|
| 1 | They look up the supplier's published public key | The photograph of the seal |
| 2 | They take the claim text and re-compute its fingerprint | Should match the fingerprint that was originally signed |
| 3 | They check the signature against the fingerprint and the public key | Math says: yes, the holder of the matching private key produced this signature — or no, they didn't |
| 4 | They check the supplier is on the official registry of verified Canadian suppliers | Is this seal an *accredited* seal, or just any random one? |

If all four checks pass → the claim is real, authored by an accredited supplier, and has not been altered since signing.

If any check fails → the claim is rejected, with a specific reason code:

- `SIGNATURE_INVALID` — someone changed the text after signing.
- `UNKNOWN_ISSUER` — the seal isn't on the accredited list.
- `MALFORMED` — the claim isn't structured correctly.

---

## 5. Linking many claims into a supply chain

A finished drone isn't made by one supplier. It passes through many.

Picture a tree:

```
       Rio Tinto                  T-Motor                Damocles Power
       (aluminum)                 (motors)               (battery)
            │                        │                       │
            │ fingerprint            │ fingerprint            │ fingerprint
            ▼                        ▼                       ▼
       Apex Machining          (no further work)        (no further work)
       (machines airframe)              │                       │
            │                           │                       │
            └──────────┬────────────────┴───────────────────────┘
                       ▼
                Raven Aerospace
                (final assembly in Ottawa)
                       │
                       ▼
                  FINISHED DRONE
```

Every supplier in this tree:

1. Creates their own signed attestation for *their* contribution.
2. References the **fingerprints** of the upstream attestations they consumed.

That reference is the link. Because each attestation is signed individually and identified by its fingerprint, the tree has two unbreakable properties:

- **No silent edits.** Change *any* node, its fingerprint changes, and every downstream node that referenced it now points to nothing.
- **No forgeries.** Every node must be signed by an accredited supplier; an unknown seal is rejected on sight.

This is why we don't need a blockchain. The integrity of the chain is already guaranteed by the math of signatures and fingerprints. Blockchains exist to solve a different problem (who-gets-to-write-first when no one trusts anyone). Here, we already know who is allowed to write — they're on the accreditation registry.

---

## 6. Computing "how Canadian"

Now the easy part. Every attestation says two numbers:

- `totalCost` — how much *this stage* cost (its own materials + its own labour)
- `canadianCost` — how much of that was spent in Canada

A computer walks the whole tree, adds up both numbers across every attestation, and divides:

```
Total cost of the drone:          $1,797.60   (sum of every stage's totalCost)
Canadian portion:                 $1,418.60   (sum of every stage's canadianCost)
Canadian content percentage:       78.9%      (the second divided by the first)
```

Then it applies the **legal rule**, exactly:

| If… | Verdict |
|---|---|
| Percentage ≥ 98% AND final assembly was in Canada | Product of Canada |
| Percentage ≥ 51% AND final assembly was in Canada | Made in Canada |
| Otherwise | Neither |

The computer never guesses. It just adds, divides, and compares to two numbers (98 and 51) that come from Canadian law. Anybody with the same attestations can re-run the same math and get the same answer.

> **This is the part of the system where AI is never used.** The verdict has to be defensible in court, reproducible by any third party, and the same answer no matter who runs it. AI introduces variability — and we have none of that in the verdict path.

---

## 7. What AI does and doesn't do

The system uses AI in five well-scoped places, **always as a helper, never as the decider**:

| Where | What AI does | Where the human / fixed math takes over |
|---|---|---|
| Supplier room | Drafts the structured attestation from "*we milled 50 airframes…*" plain-English input | Human reviews every field and signs with a hardware device |
| Auditor room | Spots suspicious patterns (a labour cost 5× the regional norm, an off-hours filing burst) | Flags it for an auditor to review — never invalidates a record |
| Auditor room | Compares the integrator's declared inputs against their shipping manifests | Outputs a report; a human auditor makes the final call |
| Purchaser room | Answers natural-language questions ("*which drones in this fleet have foreign motors?*") | The numbers it shows always come from the fixed math, never from the AI |
| Background analysis | Identifies wash-ring patterns across the whole supplier network | Feeds a risk dashboard; doesn't change anyone's verdict |

The four rules the AI follows, without exception:

1. **It does not sign attestations on behalf of suppliers.**
2. **It does not compute the legal qualification verdict.**
3. **It is not the source of truth for any factual claim** — every fact it presents must cite an attestation.
4. **It does not participate in the cryptographic verification path.**

In one line: **Cryptography for integrity. AI for plausibility.**

---

## 8. The three attacks we catch — on stage

This is the part of the demo that wins the room.

### Attack 1 — Tamper

Someone secretly edits an attestation in storage. They change the imported chip's cost from $130 to $13, trying to lift the Canadian percentage.

**What happens:** the fingerprint of the edited claim no longer matches the fingerprint the supplier originally signed. The signature check fails immediately. Result: `SIGNATURE_INVALID`.

### Attack 2 — Forge

Someone invents a fake "Canadian" supplier and signs a fake attestation with a key they made themselves.

**What happens:** their public key isn't on the accredited registry. The verifier refuses to trust any signature from a seal that wasn't approved by the accreditation authority. Result: `UNKNOWN_ISSUER`.

### Attack 3 — Replay

Someone takes a real, validly-signed attestation from a different product and pastes it into this product's chain to inflate its Canadian content.

**What happens:** every attestation carries the product's identifier *inside the signed bytes*. The verifier checks: does this attestation's product ID match the one we're verifying? No → rejected. Result: `REPLAY_DETECTED`.

**The headline result:** the Canadian-content percentage never moves under any of these attacks, because it's only ever computed from attestations that pass every check.

---

## 9. The whole workflow in one picture

```
    ┌──────────────────────────────────────────────────────────┐
    │ SUPPLIER ROOM                                            │
    │                                                          │
    │   Plain English ──> AI drafts JSON ──> Human reviews ──> │
    │                                            │             │
    │                                            ▼             │
    │                                  Hardware signs with     │
    │                                     private key          │
    │                                            │             │
    │                                            ▼             │
    │                                   Signed attestation     │
    └──────────────────────────────────┬───────────────────────┘
                                       │
                            (linked into the chain by fingerprint)
                                       │
                                       ▼
    ┌──────────────────────────────────────────────────────────┐
    │ VERIFIER (anyone, anywhere)                              │
    │                                                          │
    │   Fetch attestations ──> Check every signature ──>       │
    │     Check every supplier is on the registry ──>          │
    │     Check no replay, no cycle, no tampering ──>          │
    │     Walk the tree, sum the costs, divide ──>             │
    │                                            │             │
    │                                            ▼             │
    │                          Made in Canada / Product of CA  │
    │                                  / Neither               │
    └──────────────────────────────────┬───────────────────────┘
                                       │
                                       ▼
    ┌──────────────────────────────────────────────────────────┐
    │ AUDITOR ROOM                                             │
    │                                                          │
    │   AI flags anomalies ──> Auditor reviews ──> Disposition │
    │   (advisory — never alters the verdict above)            │
    └──────────────────────────────────────────────────────────┘
```

The flow has only three rooms, and a clear separation:

- **Crypto + math** run the spine of the system. Same input → same output, forever, by any party.
- **AI** sits on the sides — accelerating the supplier, watching for fishy patterns, answering questions.
- **Humans** sign the attestations and make the final calls on flagged anomalies.

---

## 10. Why this matters

Today, the Buy Canadian Policy is enforced largely by trust. A supplier says their product is Canadian; a procurement officer takes their word for it; if a fraud is later discovered, it takes a forensic accountant to unwind it.

With cryptographic attestations:

- Every claim is **independently checkable** by anyone, without asking permission.
- Every change to a record **leaves a trace**, because the fingerprints don't match.
- Every fake supplier **can't get past the accreditation gate**, because their seal isn't registered.
- Every legal verdict is **reproducible** by any third party with the same data.

This doesn't eliminate fraud entirely — a real, accredited Canadian supplier can still knowingly sign a false claim. But when they do, the accountability is unambiguous: their signature is on the false record, and they can be prosecuted. The system makes fraud *expensive and traceable* instead of *easy and deniable*.

That's the whole pitch, in one line:

> **Cryptography makes the records honest. AI makes the records readable. Together, they make Buy Canadian enforceable.**

---

*Companion documents: `data-contract-v0.2-draft.md` (the technical contract), `build-adopt-ai-plan.md` (where to use AI vs fixed workflow), `Maple_Ledger_Design_Document.docx` (the full production design).*
