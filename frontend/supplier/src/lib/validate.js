// Client-side validation for a REAL attestation payload (without the signature
// field). Mirrors provenance-kit/spec/attestation-schema.md so error messages
// map directly onto form fields and the bundle stays small.
//
// Validated payload shape (signature is added AFTER signing):
//   {
//     attestation_id, version, supplier_id, timestamp, action_type,
//     performed_in_country,
//     parents: [{ attestation_id, content_hash, quantity_consumed, unit }],
//     output: { name, quantity_produced, unit },
//     costs: { material_cad, labour_hours, labour_cost_cad }
//   }

const COUNTRY_RE = /^[A-Z]{2}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
// ISO-8601 UTC instant, e.g. 2026-04-15T14:30:00Z (optional fractional seconds).
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const ACTION_TYPES = [
  "raw_material_supply",
  "component_manufacture",
  "subassembly",
  "final_integration",
];

function isNum(n) {
  return typeof n === "number" && Number.isFinite(n);
}

const PARENT_KEYS = ["attestation_id", "content_hash", "quantity_consumed", "unit"];
const OUTPUT_KEYS = ["name", "quantity_produced", "unit"];
const COSTS_KEYS = ["material_cad", "labour_hours", "labour_cost_cad"];
const PAYLOAD_KEYS = [
  "attestation_id",
  "version",
  "supplier_id",
  "timestamp",
  "action_type",
  "performed_in_country",
  "parents",
  "output",
  "costs",
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

  if (typeof p.attestation_id !== "string" || p.attestation_id.length === 0) {
    errors.push("attestation_id is required and must be a non-empty string");
  }
  if (typeof p.version !== "string" || p.version.length === 0) {
    errors.push('version is required (e.g. "1.0")');
  }
  if (typeof p.supplier_id !== "string" || p.supplier_id.length === 0) {
    errors.push("supplier_id is required and must be a non-empty string");
  }
  if (typeof p.timestamp !== "string" || !TIMESTAMP_RE.test(p.timestamp)) {
    errors.push("timestamp must be an ISO-8601 UTC instant ending in Z (e.g. 2026-04-15T14:30:00Z)");
  }
  if (!ACTION_TYPES.includes(p.action_type)) {
    errors.push(`action_type must be one of: ${ACTION_TYPES.join(", ")}`);
  }
  if (typeof p.performed_in_country !== "string" || !COUNTRY_RE.test(p.performed_in_country)) {
    errors.push("performed_in_country must be an ISO-2 uppercase code matching ^[A-Z]{2}$");
  }

  // parents
  if (!Array.isArray(p.parents)) {
    errors.push("parents is required and must be an array (empty for raw_material_supply)");
  } else {
    if (p.action_type === "raw_material_supply" && p.parents.length !== 0) {
      errors.push("raw_material_supply must have an empty parents array");
    }
    if (
      (p.action_type === "subassembly" || p.action_type === "final_integration") &&
      p.parents.length < 2
    ) {
      errors.push(`${p.action_type} typically consumes 2+ parents`);
    }
    if (p.action_type === "component_manufacture" && p.parents.length < 1) {
      errors.push("component_manufacture must consume at least one parent");
    }
    p.parents.forEach((it, i) => {
      if (it === null || typeof it !== "object" || Array.isArray(it)) {
        errors.push(`parents[${i}] must be an object`);
        return;
      }
      if (typeof it.attestation_id !== "string" || it.attestation_id.length === 0) {
        errors.push(`parents[${i}].attestation_id is required`);
      }
      if (typeof it.content_hash !== "string" || !HEX64_RE.test(it.content_hash)) {
        errors.push(`parents[${i}].content_hash must be a 64-char lowercase hex SHA-256`);
      }
      if (!isNum(it.quantity_consumed) || it.quantity_consumed < 0) {
        errors.push(`parents[${i}].quantity_consumed must be a number >= 0`);
      }
      if (typeof it.unit !== "string" || it.unit.length === 0) {
        errors.push(`parents[${i}].unit is required`);
      }
      for (const k of Object.keys(it)) {
        if (!PARENT_KEYS.includes(k)) errors.push(`parents[${i}] has unknown field "${k}"`);
      }
    });
  }

  // output
  if (p.output === null || typeof p.output !== "object" || Array.isArray(p.output)) {
    errors.push("output is required and must be an object");
  } else {
    const o = p.output;
    if (typeof o.name !== "string" || o.name.length === 0) {
      errors.push("output.name is required and must be a non-empty string");
    }
    if (!isNum(o.quantity_produced) || o.quantity_produced < 0) {
      errors.push("output.quantity_produced must be a number >= 0");
    }
    if (typeof o.unit !== "string" || o.unit.length === 0) {
      errors.push("output.unit is required and must be a non-empty string");
    }
    for (const k of Object.keys(o)) {
      if (!OUTPUT_KEYS.includes(k)) errors.push(`output has unknown field "${k}"`);
    }
  }

  // costs
  if (p.costs === null || typeof p.costs !== "object" || Array.isArray(p.costs)) {
    errors.push("costs is required and must be an object");
  } else {
    const c = p.costs;
    if (!isNum(c.material_cad) || c.material_cad < 0) {
      errors.push("costs.material_cad must be a number >= 0 (CAD)");
    }
    if (!isNum(c.labour_hours) || c.labour_hours < 0) {
      errors.push("costs.labour_hours must be a number >= 0");
    }
    if (!isNum(c.labour_cost_cad) || c.labour_cost_cad < 0) {
      errors.push("costs.labour_cost_cad must be a number >= 0 (CAD)");
    }
    for (const k of Object.keys(c)) {
      if (!COSTS_KEYS.includes(k)) errors.push(`costs has unknown field "${k}"`);
    }
  }

  // no unknown top-level fields
  for (const k of Object.keys(p)) {
    if (!PAYLOAD_KEYS.includes(k)) errors.push(`payload has unknown field "${k}"`);
  }

  return { valid: errors.length === 0, errors };
}
