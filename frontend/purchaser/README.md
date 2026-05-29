# Maple Ledger — Purchaser UI

A purchaser scans a product's QR code (which encodes a **root attestation
hash**), the app calls the verifier backend, and shows whether the product
qualifies as **Made in Canada**, its Canadian-content %, the cost-by-country
breakdown, the provenance graph, and any integrity flags.

Stack: **React + Vite + Tailwind CSS v4 + Cytoscape.js**, QR scanning via
**html5-qrcode**.

## Run it

```bash
cd frontend/purchaser
npm install
npm run dev          # serves on http://localhost:5173
```

Open <http://localhost:5173>. By default it shows **mock data** (a hardcoded
`VerificationResult`), because the live verifier engine is still being built and
its `/verify` endpoint currently returns a stubbed `NONE` result.

- Click **Start camera** to scan a QR code, **or** type any root hash into the
  manual field and hit **Verify**. In mock mode the result is fixed regardless
  of the hash.
- Camera access requires a *secure context*: `http://localhost` (already the
  case for `npm run dev`) or HTTPS. On `localhost` the camera works out of the
  box.

Build / preview a production bundle:

```bash
npm run build        # outputs to dist/
npm run preview      # serves the built bundle (also on localhost)
```

## Pointing at the real backend

The app talks to `GET {VITE_BACKEND_URL}/verify/{root_hash}`. There are two
ways to flip from mock to live:

1. **Per page load (no rebuild):** append a query param —
   `http://localhost:5173/?mock=0` uses the live backend, `?mock=1` forces mock.
2. **Via env:** copy `.env.example` to `.env.local` and set:

   ```
   VITE_BACKEND_URL=http://localhost:8000
   VITE_USE_MOCK=false
   ```

The query param wins over the env var. Default is mock.

### Backend contract this UI binds to

`GET http://localhost:8000/verify/{root_hash}` →

```json
{
  "designation": "MADE_IN_CANADA",
  "canadian_pct": 0.966,
  "total_cost_cents": 1470,
  "canadian_cost_cents": 1420,
  "cost_by_country": { "CA": 1420, "CN": 50 },
  "anomalies": [
    { "reason": "SIGNATURE_INVALID", "attestation_hash": "a3f1...", "detail": "...", "advisory": false }
  ]
}
```

- `designation` ∈ `MADE_IN_CANADA` | `PRODUCT_OF_CANADA` | `NONE`
- `canadian_pct` is a 0..1 float, displayed as a percentage
- `anomalies[].reason` ∈ `MALFORMED`, `SIGNATURE_INVALID`, `UNKNOWN_ISSUER`,
  `REPLAY_DETECTED`, `BROKEN_LINK`, `CYCLE`, `MASS_BALANCE`, `ANOMALY`
- `anomalies[].advisory: true` items are informational (rendered muted);
  `advisory: false` items are hard failures (rendered prominently in red)

### Provenance graph (mock until integration)

The `/verify` response does **not** include graph topology yet. The graph is
rendered from a separate mock object in `src/mockData.js` with this shape:

```json
{ "nodes": [ { "id": "hash", "label": "motor_housing\nSUP-MOTOR · CA", "country": "CA", "status": "OK" } ],
  "edges": [ { "source": "inputHash", "target": "consumerHash" } ] }
```

`status` ∈ `OK` | `INVALID`. INVALID nodes are red; OK nodes are coloured by
country (CA green, others grey). To wire real graph data, replace `mockGraph`
in `src/App.jsx` (single marked `TODO(integration)` spot).

## Layout

```
src/
  App.jsx                 scan -> fetch -> render flow + mode badge
  api.js                  fetchVerification(rootHash): mock or live
  config.js               BACKEND_URL + USE_MOCK toggle (env + ?mock= param)
  labels.js               enum copy + $ / % formatting helpers
  mockData.js             mock VerificationResult(s) + mock graph
  components/
    QrScanner.jsx         html5-qrcode camera + manual-entry fallback
    VerdictCard.jsx       designation badge, %, cost breakdown, anomalies
    CostBreakdown.jsx     cost_by_country stacked bar + rows
    AnomalyList.jsx       hard failures vs advisory styling
    ProvenanceGraph.jsx   Cytoscape DAG, nodes coloured by status/country
```
