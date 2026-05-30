// Contract tests for the PURCHASER ↔ backend API, per doc/frontend-api.md.
//
// Two layers:
//   1. UNIT  — mock global.fetch; assert the client wrapper (verifyChain) and
//              config build the right request and handle responses/errors as the
//              doc promises. These always run, no backend needed.
//   2. LIVE  — hit a running backend on http://localhost:8000 with the real
//              worked-example chain and assert the documented response contract.
//              Auto-skipped when the backend is not reachable.
//
// Run:  node --test           (from frontend/purchaser)
//       node --test test/api.test.mjs
//
// Source under test: src/api.js (verifyChain), src/config.js (BACKEND_URL, verifyUrl).

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { verifyChain } from "../src/api.js";
import { BACKEND_URL, verifyUrl } from "../src/config.js";

const WORKED_EXAMPLE = fileURLToPath(
  new URL("../src/worked_example_chain.json", import.meta.url)
);

// Swap global.fetch for one call, always restoring afterwards.
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

const MINIMAL_CHAIN = {
  product_attestation_id: "att-anchor-0012",
  attestations: [{ attestation_id: "att-anchor-0012" }],
};

// ─── Configuration (doc §Configuration) ──────────────────────────────────────

test("config: default BACKEND_URL is localhost:8000", () => {
  // No VITE_BACKEND_URL in a plain Node env → the documented default.
  assert.equal(BACKEND_URL, "http://localhost:8000");
});

test("config: verifyUrl() appends /verify with no double slash", () => {
  assert.equal(verifyUrl(), "http://localhost:8000/verify");
  assert.ok(!/\/\/verify$/.test(verifyUrl()), "must not double the slash");
});

// ─── verifyChain request shape (doc §POST /verify → Request) ─────────────────

test("verifyChain: POSTs to /verify with JSON body and headers", async () => {
  let captured;
  const result = await withFetch(
    async (url, opts) => {
      captured = { url, opts };
      return jsonResponse({
        product_attestation_id: "att-anchor-0012",
        canadian_content_percentage: 58.4,
        designation: "made_in_canada",
        chain_valid: true,
        anomalies: [],
      });
    },
    () => verifyChain(MINIMAL_CHAIN)
  );

  assert.equal(captured.url, verifyUrl());
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers["Content-Type"], "application/json");
  assert.equal(captured.opts.headers["Accept"], "application/json");
  // body must be exactly the chain it was given, serialized.
  assert.deepEqual(JSON.parse(captured.opts.body), MINIMAL_CHAIN);
  // returns the parsed JSON unchanged.
  assert.equal(result.designation, "made_in_canada");
});

// ─── verifyChain client-side guard (doc §Client wrappers) ────────────────────

test("verifyChain: throws before sending when product_attestation_id missing", async () => {
  await withFetch(
    () => {
      throw new Error("fetch must NOT be called for invalid input");
    },
    async () => {
      await assert.rejects(
        () => verifyChain({ attestations: [] }),
        /product_attestation_id|Chain must be/
      );
    }
  );
});

test("verifyChain: throws before sending when attestations is not an array", async () => {
  await withFetch(
    () => {
      throw new Error("fetch must NOT be called for invalid input");
    },
    async () => {
      await assert.rejects(
        () => verifyChain({ product_attestation_id: "x", attestations: "nope" }),
        /Chain must be/
      );
    }
  );
});

test("verifyChain: throws on null/undefined chain", async () => {
  await assert.rejects(() => verifyChain(null), /Chain must be/);
  await assert.rejects(() => verifyChain(undefined), /Chain must be/);
});

// ─── verifyChain error handling (doc §Errors) ────────────────────────────────

test("verifyChain: non-OK status throws with HTTP code and detail", async () => {
  await withFetch(
    async () => jsonResponse({ detail: "boom" }, { status: 500, statusText: "Internal Server Error" }),
    async () => {
      await assert.rejects(
        () => verifyChain(MINIMAL_CHAIN),
        (err) => {
          assert.match(err.message, /HTTP 500/);
          assert.match(err.message, /boom/);
          return true;
        }
      );
    }
  );
});

test("verifyChain: network failure throws the documented friendly error", async () => {
  await withFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async () => {
      await assert.rejects(
        () => verifyChain(MINIMAL_CHAIN),
        /Could not reach the verifier backend/
      );
    }
  );
});

// ─── LIVE integration against a running backend (doc §Worked example) ────────

const backendUp = await (async () => {
  try {
    const r = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
})();

const live = { skip: backendUp ? false : "backend not reachable on :8000" };

test("LIVE: worked example returns the documented verdict", live, async () => {
  const chain = JSON.parse(await readFile(WORKED_EXAMPLE, "utf8"));
  const res = await verifyChain(chain);

  // exact response key set — no graph, no cost (doc §Response)
  assert.deepEqual(
    Object.keys(res).sort(),
    ["anomalies", "canadian_content_percentage", "chain_valid", "designation", "product_attestation_id"]
  );
  assert.equal(res.product_attestation_id, "att-anchor-0012");
  assert.equal(res.canadian_content_percentage, 58.4);
  assert.equal(res.designation, "made_in_canada");
  assert.equal(res.chain_valid, true);
  assert.deepEqual(res.anomalies, []);
});

test("LIVE: response field types match the contract", live, async () => {
  const chain = JSON.parse(await readFile(WORKED_EXAMPLE, "utf8"));
  const res = await verifyChain(chain);

  assert.equal(typeof res.product_attestation_id, "string");
  assert.equal(typeof res.canadian_content_percentage, "number");
  assert.ok(res.canadian_content_percentage >= 0 && res.canadian_content_percentage <= 100);
  assert.ok(["product_of_canada", "made_in_canada", "none"].includes(res.designation));
  assert.equal(typeof res.chain_valid, "boolean");
  assert.ok(Array.isArray(res.anomalies));
  // invariant: clean chain ⇒ empty anomalies (doc §invariants)
  assert.equal(res.chain_valid, res.anomalies.length === 0);
});

test("LIVE: a tampered signature is reported as an anomaly", live, async () => {
  const chain = JSON.parse(await readFile(WORKED_EXAMPLE, "utf8"));
  // flip one base64 char of the leaf's signature so it no longer verifies
  const leaf = chain.attestations.find((a) => a.attestation_id === chain.product_attestation_id);
  const v = leaf.signature.value;
  leaf.signature.value = (v[0] === "A" ? "B" : "A") + v.slice(1);

  const res = await verifyChain(chain);
  assert.equal(res.chain_valid, false);
  assert.ok(res.anomalies.length >= 1, "expected at least one anomaly");
  const a = res.anomalies[0];
  // anomaly object shape (doc §Response: anomalies[].{type,attestation_id,details})
  assert.equal(typeof a.type, "string");
  assert.ok("attestation_id" in a);
  assert.ok("details" in a);
});

test("LIVE: array order is unspecified — shuffled chain gives same verdict", live, async () => {
  const chain = JSON.parse(await readFile(WORKED_EXAMPLE, "utf8"));
  const shuffled = {
    product_attestation_id: chain.product_attestation_id,
    attestations: [...chain.attestations].reverse(),
  };
  const res = await verifyChain(shuffled);
  assert.equal(res.designation, "made_in_canada");
  assert.equal(res.canadian_content_percentage, 58.4);
  assert.equal(res.chain_valid, true);
});
