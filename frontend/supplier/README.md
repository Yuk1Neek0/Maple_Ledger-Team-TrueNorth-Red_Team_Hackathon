# Maple Ledger — Supplier UI

The supplier web UI for Maple Ledger. A verified supplier authors a provenance
**attestation** (what they produced, what inputs they consumed, the
materials/labour cost split, country of work), signs it with an **Ed25519** key
in the browser, and submits it to the backend.

Stack: **React + Vite + Tailwind CSS**, Ed25519 via
[`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519).

## Run

```bash
cd frontend/supplier
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run lint       # eslint
node src/lib/canonical.test.js   # canonicalization self-test (Node)
```

The UI talks to the backend at `http://localhost:8000` by default. Override with
a Vite env var:

```bash
VITE_BACKEND_URL=http://localhost:8000 npm run dev
```

## The flow

1. **Form** — fill in `supplier_id`, `output` (`product_id` / `quantity` /
   `unit`), the `inputs` add/remove list (`attestation_hash` + `quantity_used`),
   `materials_cents`, `labour_cents`, `work_country`, the
   `is_substantial_transformation` flag, and `timestamp`. A live preview shows
   the assembled payload and the exact canonical bytes.
2. **Client-side validation** mirrors `src/schema/attestation.schema.json`:
   required fields present, integers ≥ 0 (all money is integer **cents**),
   `work_country` matches `^[A-Z]{2}$`, `attestation_hash` is lowercase hex,
   `timestamp` is an ISO-8601 UTC instant. The "Review & sign" button is
   disabled until the payload is valid.
3. **Human confirm** — a review step shows the assembled payload and the
   canonical bytes that will be signed before anything is signed.
4. **Sign** — a fresh Ed25519 keypair is generated in-browser on load (you may
   instead paste a 32-byte / 64-hex-char private key). The signature is
   `base64( ed25519.sign(canonicalBytes, privateKey) )`.
5. **Submit** — `POST http://localhost:8000/attestations` with body =
   `payload + { "signature": "<base64>" }`. The backend returns
   `{ "hash": "<sha256 hex>" }`, which the UI displays. If the backend is
   unreachable, the UI still signs and verifies locally and shows the ready-to-
   submit signed body.

## Canonicalization (must match the backend byte-for-byte)

The backend signs/verifies over canonical bytes produced like Python's:

```python
json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
```

i.e. **object keys sorted recursively at every level, compact separators, UTF-8,
no trailing newline**. `src/lib/canonical.js` reproduces this exactly.

A self-test (`src/lib/canonical.test.js`) asserts the canonical string for the
spec's example payload is exactly:

```
{"inputs":[{"attestation_hash":"<hex>","quantity_used":1}],"is_substantial_transformation":false,"labour_cents":200,"materials_cents":500,"output":{"product_id":"raw_aluminum","quantity":1,"unit":"kg"},"supplier_id":"SUP-ALU","timestamp":"2026-05-01T08:00:00Z","work_country":"CA"}
```

It runs in two places: in Node via `node src/lib/canonical.test.js`, and in the
browser on app load (a PASS/FAIL badge in the header, plus a console log). This
has been cross-checked against real Python `json.dumps` and matches.

## Note on signature verification

The `POST /attestations` flow only schema-validates and stores the attestation;
**signature verification happens later at `/verify`**. So a browser-generated
keypair is fine for submitting. To later verify as a *known issuer*, the
supplier's **public key must be present in the identity registry** — a
self-generated key will not resolve there, so it would be treated as an unknown
issuer at verify time.

## Payload shape

```json
{
  "supplier_id": "SUP-ALU",
  "output": { "product_id": "raw_aluminum", "quantity": 1, "unit": "kg" },
  "inputs": [ { "attestation_hash": "<hex>", "quantity_used": 1 } ],
  "materials_cents": 500,
  "labour_cents": 200,
  "work_country": "CA",
  "is_substantial_transformation": false,
  "timestamp": "2026-05-01T08:00:00Z"
}
```

All money fields are integer cents; `quantity` / `quantity_used` are integers;
`work_country` is an ISO-2 uppercase code; `inputs` may be empty. The wire body
adds a `"signature"` field (base64) after signing.

## Docker (for integration)

The service intended for `docker-compose.yml` (owned outside this folder):

```yaml
supplier-ui:
  build: frontend/supplier
  ports:
    - "5173:5173"      # Vite dev server (or map 80 if served as a static build)
```

This folder does not include a Dockerfile or edit `docker-compose.yml` by
design; integration wiring lives outside `frontend/supplier/`.

## Layout

```
frontend/supplier/
  src/
    App.jsx                  # the form / confirm / done flow
    lib/
      canonical.js           # backend-matching canonical JSON serializer
      canonical.test.js      # canonicalization self-test (Node + browser)
      validate.js            # client-side schema validation
      crypto.js              # Ed25519 keys, signing, base64/hex helpers
      api.js                 # POST /attestations
    schema/
      attestation.schema.json  # JSON Schema mirrored by validate.js
```
