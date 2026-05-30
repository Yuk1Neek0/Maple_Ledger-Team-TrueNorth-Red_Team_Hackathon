// Contract tests for the SUPPLIER ↔ backend API, per doc/frontend-api.md.
//
// The supplier submits ONE freshly-signed attestation as a single-node chain via
// submitAttestation() (src/lib/api.js), which POSTs to /verify.
//
// Two layers:
//   1. UNIT  — mock global.fetch; assert the wrapper builds the one-node chain
//              envelope, parses the response, and throws on a rejected request.
//              Always run, no backend needed.
//   2. LIVE  — submit a real signed raw_material_supply attestation (no parents,
//              self-verifies) from the worked example and assert the documented
//              response contract. Auto-skipped when the backend is down.
//
// Run:  node --test            (from frontend/supplier)
//
// Source under test: src/lib/api.js (submitAttestation, BACKEND_URL).

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { submitAttestation, BACKEND_URL } from "../src/lib/api.js";

// The supplier app has no bundled chain fixture; borrow the purchaser's worked
// example (same repo) for a real signed attestation to submit live.
const WORKED_EXAMPLE = fileURLToPath(
  new URL("../../purchaser/src/worked_example_chain.json", import.meta.url)
);

async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

function jsonResponse(body, { status = 200, statusText = "OK" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const SIGNED_ATT = {
  attestation_id: "att-anchor-0001",
  supplier_id: "sup-porcher",
  signature: { algorithm: "ed25519", value: "Zm9vYmFy" },
};

// ─── Configuration ───────────────────────────────────────────────────────────

test("config: default BACKEND_URL is localhost:8000", () => {
  assert.equal(BACKEND_URL, "http://localhost:8000");
});

// ─── submitAttestation request shape (doc §Client wrappers) ──────────────────

test("submitAttestation: wraps the attestation as a one-node chain", async () => {
  let captured;
  await withFetch(
    async (url, opts) => {
      captured = { url, opts };
      return jsonResponse({
        product_attestation_id: "att-anchor-0001",
        canadian_content_percentage: 0,
        designation: "none",
        chain_valid: true,
        anomalies: [],
      });
    },
    () => submitAttestation(SIGNED_ATT)
  );

  assert.equal(captured.url, `${BACKEND_URL}/verify`);
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers["Content-Type"], "application/json");

  const body = JSON.parse(captured.opts.body);
  // documented envelope: { product_attestation_id, attestations: [theAttestation] }
  assert.equal(body.product_attestation_id, SIGNED_ATT.attestation_id);
  assert.ok(Array.isArray(body.attestations));
  assert.equal(body.attestations.length, 1);
  assert.deepEqual(body.attestations[0], SIGNED_ATT);
});

test("submitAttestation: returns the parsed verdict JSON", async () => {
  const verdict = {
    product_attestation_id: "att-anchor-0001",
    canadian_content_percentage: 0,
    designation: "none",
    chain_valid: true,
    anomalies: [],
  };
  const out = await withFetch(
    async () => jsonResponse(verdict),
    () => submitAttestation(SIGNED_ATT)
  );
  assert.deepEqual(out, verdict);
});

// ─── submitAttestation error handling (doc §Errors) ──────────────────────────

test("submitAttestation: non-OK status throws with HTTP code and detail", async () => {
  await withFetch(
    async () => jsonResponse({ detail: "bad attestation" }, { status: 400, statusText: "Bad Request" }),
    async () => {
      await assert.rejects(
        () => submitAttestation(SIGNED_ATT),
        (err) => {
          assert.match(err.message, /HTTP 400/);
          assert.match(err.message, /bad attestation/);
          return true;
        }
      );
    }
  );
});

test("submitAttestation: tolerates a non-JSON error body", async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "upstream exploded",
    }),
    async () => {
      await assert.rejects(() => submitAttestation(SIGNED_ATT), /HTTP 502/);
    }
  );
});

// ─── LIVE integration against a running backend ──────────────────────────────

const backendUp = await (async () => {
  try {
    const r = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
})();

const live = { skip: backendUp ? false : "backend not reachable on :8000" };

test("LIVE: submitting a signed raw-material attestation returns the contract shape", live, async () => {
  const chain = JSON.parse(await readFile(WORKED_EXAMPLE, "utf8"));
  // pick a real signed attestation with no parents (self-verifies on its own)
  const raw = chain.attestations.find(
    (a) => !a.parents || a.parents.length === 0
  );
  assert.ok(raw, "worked example should contain a parent-less attestation");

  const res = await submitAttestation(raw);

  assert.deepEqual(
    Object.keys(res).sort(),
    ["anomalies", "canadian_content_percentage", "chain_valid", "designation", "product_attestation_id"]
  );
  assert.equal(res.product_attestation_id, raw.attestation_id);
  assert.equal(typeof res.canadian_content_percentage, "number");
  assert.ok(["product_of_canada", "made_in_canada", "none"].includes(res.designation));
  assert.equal(typeof res.chain_valid, "boolean");
  assert.ok(Array.isArray(res.anomalies));
});
