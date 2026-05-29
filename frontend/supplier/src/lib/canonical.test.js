// Canonicalization self-test.
//
// Asserts our in-browser canonicalizer produces byte-identical output to the
// backend's Python canonicalization:
//   json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
//
// Runnable two ways:
//   - in the browser: imported by App.jsx, logs PASS/FAIL to the console (dev only)
//   - in Node:        `node src/lib/canonical.test.js` (exits non-zero on failure)

import { canonicalize } from "./canonical.js";

// The exact example from the task spec, with the placeholder hash kept verbatim.
const EXAMPLE_PAYLOAD = {
  supplier_id: "SUP-ALU",
  output: { product_id: "raw_aluminum", quantity: 1, unit: "kg" },
  inputs: [{ attestation_hash: "<hex>", quantity_used: 1 }],
  materials_cents: 500,
  labour_cents: 200,
  work_country: "CA",
  is_substantial_transformation: false,
  timestamp: "2026-05-01T08:00:00Z",
};

const EXPECTED =
  '{"inputs":[{"attestation_hash":"<hex>","quantity_used":1}],"is_substantial_transformation":false,"labour_cents":200,"materials_cents":500,"output":{"product_id":"raw_aluminum","quantity":1,"unit":"kg"},"supplier_id":"SUP-ALU","timestamp":"2026-05-01T08:00:00Z","work_country":"CA"}';

export function runCanonicalSelfTest() {
  const actual = canonicalize(EXAMPLE_PAYLOAD);
  const pass = actual === EXPECTED;

  // Extra check: insertion order must not matter — same keys, different order.
  const reordered = {
    timestamp: "2026-05-01T08:00:00Z",
    work_country: "CA",
    is_substantial_transformation: false,
    labour_cents: 200,
    materials_cents: 500,
    inputs: [{ quantity_used: 1, attestation_hash: "<hex>" }],
    output: { unit: "kg", quantity: 1, product_id: "raw_aluminum" },
    supplier_id: "SUP-ALU",
  };
  const orderStable = canonicalize(reordered) === EXPECTED;

  return { pass: pass && orderStable, actual, expected: EXPECTED, orderStable };
}

// Node entrypoint: run when executed directly via `node src/lib/canonical.test.js`.
// `globalThis.process` is referenced indirectly so this file stays valid under
// the browser-targeted ESLint config (no bare `process` global).
const proc = globalThis.process;
const isNodeMain =
  proc &&
  Array.isArray(proc.argv) &&
  proc.argv[1] &&
  /canonical\.test\.js$/.test(proc.argv[1].replace(/\\/g, "/"));

if (isNodeMain) {
  const r = runCanonicalSelfTest();
  if (r.pass) {
    console.log("PASS: canonical output matches expected backend bytes");
    console.log("  " + r.actual);
    proc.exit(0);
  } else {
    console.error("FAIL: canonical output mismatch");
    console.error("  expected: " + r.expected);
    console.error("  actual:   " + r.actual);
    console.error("  order-stable: " + r.orderStable);
    proc.exit(1);
  }
}
