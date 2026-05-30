// Canonicalization byte-parity self-test.
//
// Proves the in-browser canonicalizer + content_hash reproduce the challenge
// reference library (provenance-kit/reference_lib/canonical.py) BYTE-FOR-BYTE.
//
// Fixtures are real attestations from the worked example
// (provenance-kit/worked-example/recovery_drone_chain.json). Their known
// content_hash values are the parents[].content_hash referenced by their
// children — i.e. the exact SHA-256 the reference lib produces. If our canonical
// bytes were off by a single byte (the classic 520.0 vs 520 trap), the hash
// would not match.
//
// Runnable two ways:
//   - in the browser: imported by App.jsx, logs PASS/FAIL to the console (dev only)
//   - in Node:        `node src/lib/canonical.test.js` (exits non-zero on failure)

import { canonicalize } from "./canonical.js";
import { contentHash } from "./crypto.js";

// att-anchor-0001 — a raw_material_supply with whole-float costs (360.0, 0.0)
// and whole-float quantity (8.0). content_hash from the worked example.
const FIXTURE_RAW = {
  attestation_id: "att-anchor-0001",
  version: "1.0",
  supplier_id: "sup-porcher",
  timestamp: "2026-03-06T09:00:00Z",
  action_type: "raw_material_supply",
  performed_in_country: "FR",
  parents: [],
  output: { name: "PN9 Ripstop Fabric", quantity_produced: 8.0, unit: "m2" },
  costs: { material_cad: 360.0, labour_hours: 0.0, labour_cost_cad: 0.0 },
  signature: {
    algorithm: "ed25519",
    value: "DdFl42bZO0UxXeQiH4RZtyaIjmuboJd11r7cgX2nn+O8esEizeE2TGtm0y9KKTGHZ6oNGs5Jx+zfpqbowZCRDQ==",
  },
};
const FIXTURE_RAW_HASH =
  "1ed6d6cc7b1526c7473ad8532a6f8ae5e17470bc09434f5da51e9d33c2cddaa4";

// The expected canonical bytes for att-anchor-0001 (signature excluded): keys
// sorted, compact, whole floats as integers (360.0 -> 360, 8.0 -> 8).
const FIXTURE_RAW_CANONICAL =
  '{"action_type":"raw_material_supply","attestation_id":"att-anchor-0001","costs":{"labour_cost_cad":0,"labour_hours":0,"material_cad":360},"output":{"name":"PN9 Ripstop Fabric","quantity_produced":8,"unit":"m2"},"parents":[],"performed_in_country":"FR","supplier_id":"sup-porcher","timestamp":"2026-03-06T09:00:00Z","version":"1.0"}';

// att-anchor-0005 — a component_manufacture with a NON-whole cost (520.0 IS
// whole, but its parents carry mixed int/float quantities) and labour_hours 6.5.
// content_hash from the worked example (referenced by att-anchor-0012).
const FIXTURE_COMPONENT = {
  attestation_id: "att-anchor-0005",
  version: "1.0",
  supplier_id: "sup-avss-corp",
  timestamp: "2026-03-21T14:30:00Z",
  action_type: "component_manufacture",
  performed_in_country: "CA",
  parents: [
    { attestation_id: "att-anchor-0001", content_hash: "1ed6d6cc7b1526c7473ad8532a6f8ae5e17470bc09434f5da51e9d33c2cddaa4", quantity_consumed: 8.0, unit: "m2" },
    { attestation_id: "att-anchor-0002", content_hash: "5b80da598314031d60883ed06302e2ca2adbba33897612477c6a3847d1d41b42", quantity_consumed: 12.0, unit: "m" },
    { attestation_id: "att-anchor-0003", content_hash: "d9c93065b394d958c4e0a0ed015a6efa23f5b7f061852c8a5825a2936861d8b7", quantity_consumed: 4, unit: "units" },
    { attestation_id: "att-anchor-0004", content_hash: "03ab4bbcc8b38a7f39054e227f9818f02c7ce3bb50ca4e8ac5e80c9272f9c6ab", quantity_consumed: 8, unit: "units" },
  ],
  output: { name: "Parachute Recovery Assembly", quantity_produced: 1, unit: "units" },
  costs: { material_cad: 0.0, labour_hours: 6.5, labour_cost_cad: 520.0 },
  signature: {
    algorithm: "ed25519",
    value: "B+m+AQz1dtpWVuz0+WmTNYXUN4fMl4bDwITipycWNWVDOO0Hz1KRZuw0wZCwcYRx+TKNaMgAEwLyCTVANUwQCA==",
  },
};
const FIXTURE_COMPONENT_HASH =
  "d27cc6a9997e233e82f0b9cf0bd6c960b4dd68428f86485382914c91dbfe1faf";

export function runCanonicalSelfTest() {
  const checks = [];

  // 1. Exact canonical-string match for the raw fixture (whole-float -> int).
  const { signature: _s1, ...raw } = FIXTURE_RAW;
  void _s1;
  const rawCanonical = canonicalize(raw);
  checks.push({
    name: "canonical bytes (att-anchor-0001)",
    pass: rawCanonical === FIXTURE_RAW_CANONICAL,
    actual: rawCanonical,
    expected: FIXTURE_RAW_CANONICAL,
  });

  // 2. content_hash matches the reference lib for both fixtures (the real proof).
  const rawHash = contentHash(FIXTURE_RAW);
  checks.push({
    name: "content_hash (att-anchor-0001)",
    pass: rawHash === FIXTURE_RAW_HASH,
    actual: rawHash,
    expected: FIXTURE_RAW_HASH,
  });

  const compHash = contentHash(FIXTURE_COMPONENT);
  checks.push({
    name: "content_hash (att-anchor-0005, labour_hours 6.5)",
    pass: compHash === FIXTURE_COMPONENT_HASH,
    actual: compHash,
    expected: FIXTURE_COMPONENT_HASH,
  });

  // 3. Key insertion order must not matter.
  const reordered = {
    version: "1.0",
    costs: { labour_cost_cad: 0.0, material_cad: 360.0, labour_hours: 0.0 },
    output: { unit: "m2", quantity_produced: 8.0, name: "PN9 Ripstop Fabric" },
    timestamp: "2026-03-06T09:00:00Z",
    performed_in_country: "FR",
    parents: [],
    action_type: "raw_material_supply",
    supplier_id: "sup-porcher",
    attestation_id: "att-anchor-0001",
  };
  checks.push({
    name: "order-independence",
    pass: canonicalize(reordered) === FIXTURE_RAW_CANONICAL,
    actual: canonicalize(reordered),
    expected: FIXTURE_RAW_CANONICAL,
  });

  const pass = checks.every((c) => c.pass);
  return { pass, checks, actual: rawCanonical };
}

// Node entrypoint: run when executed directly via `node src/lib/canonical.test.js`.
const proc = globalThis.process;
const isNodeMain =
  proc &&
  Array.isArray(proc.argv) &&
  proc.argv[1] &&
  /canonical\.test\.js$/.test(proc.argv[1].replace(/\\/g, "/"));

if (isNodeMain) {
  const r = runCanonicalSelfTest();
  for (const c of r.checks) {
    if (c.pass) {
      console.log(`PASS: ${c.name}`);
    } else {
      console.error(`FAIL: ${c.name}`);
      console.error(`  expected: ${c.expected}`);
      console.error(`  actual:   ${c.actual}`);
    }
  }
  proc.exit(r.pass ? 0 : 1);
}
