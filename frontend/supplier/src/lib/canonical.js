// Canonical JSON serialization that matches the challenge reference library
// (provenance-kit/reference_lib/canonical.py) BYTE-FOR-BYTE.
//
// Rules (from spec/attestation-schema.md §"Canonical serialization"):
//   1. JSON, object keys sorted by Unicode code point, RECURSIVELY at every level.
//   2. No insignificant whitespace (compact "," and ":" separators).
//   3. UTF-8; printable non-ASCII emitted as raw UTF-8 (NOT \uXXXX). Only control
//      chars (< 0x20) and JSON-required chars are escaped.
//   4. The `signature` field is excluded from the bytes-to-sign / content hash.
//   5. Whole numbers serialize as integers (1, not 1.0); non-whole as floats with
//      no trailing zeros (520.5, not 520.50).
//   6. No NaN / Infinity / scientific notation.
//
// The number rule (5) is the #1 signature-mismatch trap: Python emits 520.0 as
// "520". JS JSON.parse already collapses 520.0 -> the number 520, but we make the
// rule explicit here so a float that happens to be whole (e.g. produced in code)
// still serializes as an integer, exactly like the reference lib's _format_number.

/**
 * Produce the canonical JSON string for a JSON-compatible value.
 * @param {*} value
 * @returns {string} canonical JSON text
 */
export function canonicalize(value) {
  return serialize(value);
}

// Mirrors reference_lib._format_number.
function formatNumber(n) {
  if (!Number.isFinite(n)) {
    throw new Error("Cannot canonicalize non-finite number: " + n);
  }
  if (Number.isInteger(n)) {
    // Whole number (incl. whole floats like 520.0) -> integer form.
    // Number.isInteger(520.0) is true in JS; String(520) === "520".
    return String(n);
  }
  // Non-whole: shortest round-trippable decimal. JS Number#toString and Python's
  // repr both emit the shortest decimal that round-trips, so they agree (e.g.
  // 1.2 -> "1.2", 520.5 -> "520.5", 0.237 -> "0.237").
  const s = String(n);
  if (s.includes("e") || s.includes("E")) {
    throw new Error("Scientific notation not supported in canonical form: " + s);
  }
  return s;
}

// Mirrors reference_lib._escape_string: escape only the JSON-required chars and
// control chars; pass printable ASCII and raw UTF-8 through unescaped.
function escapeString(s) {
  let out = '"';
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch.charCodeAt(0) < 0x20) {
      out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    } else {
      out += ch; // printable ASCII + raw UTF-8
    }
  }
  return out + '"';
}

function serialize(value) {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") return formatNumber(value);
  if (t === "string") return escapeString(value);

  if (Array.isArray(value)) {
    return "[" + value.map((item) => serialize(item)).join(",") + "]";
  }

  if (t === "object") {
    // Sort keys by code point (matches Python's sorted() on str keys for ASCII
    // field names used throughout this schema).
    const keys = Object.keys(value).sort();
    const parts = keys.map((key) => escapeString(key) + ":" + serialize(value[key]));
    return "{" + parts.join(",") + "}";
  }

  throw new Error("Cannot canonicalize value of type " + t);
}

/**
 * Canonical UTF-8 bytes for a value — exactly what the backend signs/verifies over.
 * @param {*} value
 * @returns {Uint8Array}
 */
export function canonicalBytes(value) {
  return new TextEncoder().encode(canonicalize(value));
}
