// Human-readable copy for the contract enums, plus small formatting helpers.
// All wording targets a non-technical purchaser, not an engineer.

export const DESIGNATION = {
  PRODUCT_OF_CANADA: {
    title: "Product of Canada",
    blurb: "Essentially all costs are Canadian (98%+) with final assembly in Canada.",
    pass: true,
  },
  MADE_IN_CANADA: {
    title: "Made in Canada",
    blurb: "A majority of costs are Canadian (51%+) with final assembly in Canada.",
    pass: true,
  },
  NONE: {
    title: "Not Qualified",
    blurb: "This product does not meet the “Made in Canada” cost threshold.",
    pass: false,
  },
};

export function designationInfo(designation) {
  return (
    DESIGNATION[designation] || {
      title: "Unknown",
      blurb: "Unrecognized designation returned by the verifier.",
      pass: false,
    }
  );
}

// reason ∈ MALFORMED, SIGNATURE_INVALID, UNKNOWN_ISSUER, REPLAY_DETECTED,
//          BROKEN_LINK, CYCLE, MASS_BALANCE, ANOMALY
export const ANOMALY_LABEL = {
  MALFORMED: "Malformed attestation",
  SIGNATURE_INVALID: "Invalid signature",
  UNKNOWN_ISSUER: "Unknown supplier",
  REPLAY_DETECTED: "Replayed attestation",
  BROKEN_LINK: "Broken provenance link",
  CYCLE: "Circular provenance",
  MASS_BALANCE: "Mass-balance mismatch",
  ANOMALY: "Statistical anomaly",
};

export function anomalyLabel(reason) {
  return ANOMALY_LABEL[reason] || reason || "Issue";
}

// Plain-language explanation a buyer can act on, used when the backend gives
// no `detail`.
export const ANOMALY_FALLBACK_DETAIL = {
  MALFORMED: "An attestation in the chain was not well-formed.",
  SIGNATURE_INVALID:
    "A cryptographic signature in the chain did not verify — the data may have been altered.",
  UNKNOWN_ISSUER:
    "An attestation was signed by a supplier that is not in the trusted registry.",
  REPLAY_DETECTED:
    "An attestation appears to have been copied from another product.",
  BROKEN_LINK: "A referenced upstream attestation is missing from the chain.",
  CYCLE: "The provenance graph contains a loop, which is not valid.",
  MASS_BALANCE:
    "The declared inputs do not balance against the declared output.",
  ANOMALY: "Something about this stage looks unusual and was flagged for review.",
};

export function anomalyDetail(anomaly) {
  return (
    anomaly.detail || ANOMALY_FALLBACK_DETAIL[anomaly.reason] || "Flagged by the verifier."
  );
}

/** Format a 0..1 float as a whole-ish percentage string, e.g. 0.966 -> "96.6%". */
export function formatPct(frac) {
  if (typeof frac !== "number" || Number.isNaN(frac)) return "—";
  const pct = frac * 100;
  // Show one decimal unless it's a clean integer.
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Format integer cents as CAD, e.g. 1420 -> "$14.20". */
export function formatCents(cents) {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
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
};

export function countryName(code) {
  return COUNTRY_NAME[code] || code;
}
