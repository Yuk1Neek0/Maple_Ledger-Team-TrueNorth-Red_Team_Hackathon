// Canonical JSON serialization that matches the backend byte-for-byte.
//
// The backend produces canonical bytes like Python's:
//   json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
//
// That means:
//   - object keys sorted lexicographically (by Unicode code point), RECURSIVELY at every level
//   - no insignificant whitespace ("," and ":" separators, nothing else)
//   - UTF-8 encoding, no trailing newline
//   - non-ASCII characters emitted literally (ensure_ascii=False)
//
// We rely on JSON.stringify for string escaping, because Python's json and
// JavaScript's JSON.stringify escape the same mandatory set of characters
// (", \, and control chars U+0000..U+001F) using identical \uXXXX / short
// escapes, and neither escapes non-ASCII when ensure_ascii is false. The only
// behavioural gaps we must close ourselves are (a) key ordering and (b) the
// compact separators — both handled below.

/**
 * Produce the canonical JSON string for a JSON-compatible value.
 * Object keys are sorted recursively; output has no insignificant whitespace.
 *
 * @param {*} value - a JSON-serializable value (object/array/string/number/boolean/null)
 * @returns {string} canonical JSON text
 */
export function canonicalize(value) {
  return serialize(value);
}

function serialize(value) {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "string") {
    // JSON.stringify gives RFC-compliant escaping identical to Python's
    // json.dumps for the mandatory escape set, and (like ensure_ascii=False)
    // leaves non-ASCII characters literal.
    return JSON.stringify(value);
  }

  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot canonicalize non-finite number: " + value);
    }
    // For the integer-only payload this matches Python exactly. JSON.stringify
    // is used so any incidental floats still serialize sensibly.
    return JSON.stringify(value);
  }

  if (t === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => serialize(item));
    return "[" + items.join(",") + "]";
  }

  if (t === "object") {
    // Sort keys by Unicode code point. JavaScript's default Array#sort on
    // strings already compares by UTF-16 code unit; for the BMP characters
    // used in this schema (ASCII field names) that is identical to Python's
    // code-point ordering.
    const keys = Object.keys(value).sort();
    const parts = keys.map((key) => {
      return JSON.stringify(key) + ":" + serialize(value[key]);
    });
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
