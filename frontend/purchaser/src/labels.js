// Human-readable copy for the contract enums, plus small formatting helpers.
// All wording targets a non-technical purchaser, not an engineer.

// Keyed by the REAL lowercase designation enum returned by POST /verify:
//   product_of_canada | made_in_canada | none
export const DESIGNATION = {
  product_of_canada: {
    title: "Product of Canada",
    blurb: "Essentially all costs are Canadian (98%+) with the last substantial transformation in Canada.",
    pass: true,
  },
  made_in_canada: {
    title: "Made in Canada",
    blurb: "A majority of costs are Canadian (51%+) with the last substantial transformation in Canada.",
    pass: true,
  },
  none: {
    title: "Not Qualified",
    blurb: "This product does not meet the “Made in Canada” cost threshold (or the last transformation was not in Canada).",
    pass: false,
  },
};

export function designationInfo(designation) {
  const key = typeof designation === "string" ? designation.toLowerCase() : "";
  return (
    DESIGNATION[key] || {
      title: "Unknown",
      blurb: "Unrecognized designation returned by the verifier.",
      pass: false,
    }
  );
}

// `anomalies[].type` is a FREE-FORM snake_case label in the real contract. The
// spec names these examples; the set is not exhaustive, so we humanize known
// types and fall back to title-casing anything else.
export const ANOMALY_LABEL = {
  signature_invalid: "Invalid signature",
  signature_unknown_supplier: "Unknown supplier",
  parent_hash_mismatch: "Parent hash mismatch",
  mass_balance_violation: "Mass-balance violation",
  circular_reference: "Circular provenance",
  dangling_parent: "Broken provenance link",
  timestamp_inversion: "Out-of-order timestamps",
  unit_mismatch: "Unit mismatch",
  transformation_implausible: "Implausible transformation",
  cost_anomaly: "Cost anomaly",
  insufficient_data: "Insufficient data",
};

export function anomalyLabel(type) {
  if (ANOMALY_LABEL[type]) return ANOMALY_LABEL[type];
  if (typeof type === "string" && type) {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Issue";
}

// Plain-language explanation a buyer can act on, used when the backend gives
// no `details`.
export const ANOMALY_FALLBACK_DETAIL = {
  signature_invalid:
    "A cryptographic signature in the chain did not verify — the data may have been altered.",
  signature_unknown_supplier:
    "An attestation was signed by a supplier that is not in the trusted registry.",
  parent_hash_mismatch:
    "A parent reference's content hash does not match the recomputed hash of that attestation — the parent's content was changed after it was referenced.",
  mass_balance_violation:
    "A step consumed more of an input than was produced upstream.",
  circular_reference: "The provenance graph contains a loop, which is not valid.",
  dangling_parent: "A referenced upstream attestation is missing from the chain.",
  timestamp_inversion: "An input attestation is dated after its consumer — possible clock issue.",
  unit_mismatch: "A consumed quantity's unit does not match the parent's output unit.",
  transformation_implausible: "This transformation step is structurally implausible (e.g. claims no inputs).",
  cost_anomaly: "This step's declared cost is unusual versus comparable suppliers.",
  insufficient_data: "There was not enough cost data to compute a designation.",
};

export function anomalyDetail(anomaly) {
  return (
    anomaly.details || ANOMALY_FALLBACK_DETAIL[anomaly.type] || "Flagged by the verifier."
  );
}

/**
 * Format the real `canadian_content_percentage` (a 0-100 number) as a string,
 * e.g. 58.4 -> "58.4%". One decimal unless it's a clean integer.
 */
export function formatPct(pct) {
  if (typeof pct !== "number" || Number.isNaN(pct)) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Format a CAD dollar amount, e.g. 520 -> "$520.00". */
export function formatCad(cad) {
  if (typeof cad !== "number" || Number.isNaN(cad)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cad);
}

// Friendly country names for the cost breakdown. Falls back to the raw code.
export const COUNTRY_NAME = {
  CA: "Canada",
  CN: "China",
  US: "United States",
  MX: "Mexico",
  DE: "Germany",
  JP: "Japan",
  KR: "South Korea",
  TW: "Taiwan",
  GB: "United Kingdom",
  FR: "France",
  HK: "Hong Kong",
  VN: "Vietnam",
  IN: "India",
  IT: "Italy",
};

export function countryName(code) {
  return COUNTRY_NAME[code] || code;
}
