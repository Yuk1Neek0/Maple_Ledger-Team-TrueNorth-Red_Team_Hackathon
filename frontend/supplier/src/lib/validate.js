// Client-side schema validation mirroring src/schema/attestation.schema.json.
//
// We validate by hand (rather than pulling in a full JSON-Schema engine) so the
// error messages map directly onto form fields and the bundle stays small. The
// rules below MUST stay in sync with attestation.schema.json:
//   - all required fields present
//   - money fields are integers >= 0 (cents)
//   - quantity / quantity_used are integers >= 0
//   - work_country matches ^[A-Z]{2}$
//   - attestation_hash is lowercase hex
//   - timestamp is an ISO-8601 UTC instant
//   - no unknown ("additional") properties

const WORK_COUNTRY_RE = /^[A-Z]{2}$/;
const HEX_RE = /^[0-9a-f]+$/;
// RFC 3339 / ISO-8601 UTC instant, e.g. 2026-05-01T08:00:00Z (optional fractional seconds).
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isInt(n) {
  return typeof n === "number" && Number.isInteger(n);
}

const OUTPUT_KEYS = ["product_id", "quantity", "unit"];
const INPUT_KEYS = ["attestation_hash", "quantity_used"];
const PAYLOAD_KEYS = [
  "supplier_id",
  "output",
  "inputs",
  "materials_cents",
  "labour_cents",
  "work_country",
  "is_substantial_transformation",
  "timestamp",
];

/**
 * Validate an assembled attestation payload (WITHOUT the signature field).
 * @param {object} p
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePayload(p) {
  const errors = [];

  if (p === null || typeof p !== "object" || Array.isArray(p)) {
    return { valid: false, errors: ["payload must be an object"] };
  }

  // supplier_id
  if (typeof p.supplier_id !== "string" || p.supplier_id.length === 0) {
    errors.push("supplier_id is required and must be a non-empty string");
  }

  // output
  if (p.output === null || typeof p.output !== "object" || Array.isArray(p.output)) {
    errors.push("output is required and must be an object");
  } else {
    const o = p.output;
    if (typeof o.product_id !== "string" || o.product_id.length === 0) {
      errors.push("output.product_id is required and must be a non-empty string");
    }
    if (!isInt(o.quantity) || o.quantity < 0) {
      errors.push("output.quantity must be an integer >= 0");
    }
    if (typeof o.unit !== "string" || o.unit.length === 0) {
      errors.push("output.unit is required and must be a non-empty string");
    }
    for (const k of Object.keys(o)) {
      if (!OUTPUT_KEYS.includes(k)) errors.push(`output has unknown field "${k}"`);
    }
  }

  // inputs
  if (!Array.isArray(p.inputs)) {
    errors.push("inputs is required and must be an array (may be empty)");
  } else {
    p.inputs.forEach((it, i) => {
      if (it === null || typeof it !== "object" || Array.isArray(it)) {
        errors.push(`inputs[${i}] must be an object`);
        return;
      }
      if (typeof it.attestation_hash !== "string" || !HEX_RE.test(it.attestation_hash)) {
        errors.push(`inputs[${i}].attestation_hash must be a lowercase hex string`);
      }
      if (!isInt(it.quantity_used) || it.quantity_used < 0) {
        errors.push(`inputs[${i}].quantity_used must be an integer >= 0`);
      }
      for (const k of Object.keys(it)) {
        if (!INPUT_KEYS.includes(k)) errors.push(`inputs[${i}] has unknown field "${k}"`);
      }
    });
  }

  // money
  if (!isInt(p.materials_cents) || p.materials_cents < 0) {
    errors.push("materials_cents must be an integer >= 0 (cents)");
  }
  if (!isInt(p.labour_cents) || p.labour_cents < 0) {
    errors.push("labour_cents must be an integer >= 0 (cents)");
  }

  // work_country
  if (typeof p.work_country !== "string" || !WORK_COUNTRY_RE.test(p.work_country)) {
    errors.push("work_country must be an ISO-2 uppercase code matching ^[A-Z]{2}$");
  }

  // is_substantial_transformation
  if (typeof p.is_substantial_transformation !== "boolean") {
    errors.push("is_substantial_transformation must be a boolean");
  }

  // timestamp
  if (typeof p.timestamp !== "string" || !TIMESTAMP_RE.test(p.timestamp)) {
    errors.push("timestamp must be an ISO-8601 UTC instant ending in Z (e.g. 2026-05-01T08:00:00Z)");
  }

  // no unknown top-level fields
  for (const k of Object.keys(p)) {
    if (!PAYLOAD_KEYS.includes(k)) errors.push(`payload has unknown field "${k}"`);
  }

  return { valid: errors.length === 0, errors };
}
