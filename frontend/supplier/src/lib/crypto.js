// Ed25519 signing in the browser via @noble/ed25519, matching the challenge
// reference library (provenance-kit/reference_lib/crypto.py):
//   - keys are raw 32-byte Ed25519 keys, base64-encoded for transport
//   - the signature covers canonical_serialize(attestation, exclude_signature=True)
//   - the signature field is { algorithm: "ed25519", value: <base64 of 64 bytes> }
//
// @noble/ed25519 v3's synchronous API requires a SHA-512 implementation to be
// injected; we wire in @noble/hashes. This must run before any sign/getPublicKey
// call, so we do it at module load.
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { canonicalize, canonicalBytes } from "./canonical.js";

ed.hashes.sha512 = sha512;

// ---- hex helpers ----------------------------------------------------------

/** @param {Uint8Array} bytes @returns {string} lowercase hex */
export function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** @param {string} hex @returns {Uint8Array} */
export function fromHex(hex) {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// ---- base64 helpers (standard, padded) ------------------------------------

/** @param {Uint8Array} bytes @returns {string} standard base64 */
export function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** @param {string} b64 @returns {Uint8Array} */
export function fromBase64(b64) {
  const clean = b64.trim();
  let bin;
  try {
    bin = atob(clean);
  } catch {
    throw new Error("Invalid base64 string");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- keys -----------------------------------------------------------------

function keyObj(privateKey) {
  const publicKey = ed.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    privateHex: toHex(privateKey),
    publicHex: toHex(publicKey),
    privateB64: toBase64(privateKey),
    publicB64: toBase64(publicKey),
  };
}

/**
 * Generate a fresh Ed25519 keypair.
 * @returns {{ privateKey, publicKey, privateHex, publicHex, privateB64, publicB64 }}
 */
export function generateKeypair() {
  return keyObj(ed.utils.randomSecretKey()); // 32-byte seed
}

/** Derive a keypair from a pasted 32-byte hex private key (seed). */
export function keypairFromPrivateHex(privateHex) {
  const privateKey = fromHex(privateHex);
  if (privateKey.length !== 32) {
    throw new Error("Ed25519 private key must be 32 bytes (64 hex chars)");
  }
  return keyObj(privateKey);
}

/**
 * Derive a keypair from a base64 32-byte private key (seed) — the format the
 * challenge ships in provenance-kit/private_keys/supplier_private_keys.json.
 */
export function keypairFromPrivateB64(privateB64) {
  const privateKey = fromBase64(privateB64);
  if (privateKey.length !== 32) {
    throw new Error("Ed25519 private key must decode to 32 bytes");
  }
  return keyObj(privateKey);
}

// ---- hashing --------------------------------------------------------------

/**
 * content_hash: SHA-256 (lowercase hex) over the canonical form with `signature`
 * excluded — the value used for parents[].content_hash and the anchor registry.
 * Matches reference_lib.canonical.content_hash.
 * @param {object} attestation - WITHOUT (or with) a signature field; it is dropped
 * @returns {string} lowercase hex
 */
export function contentHash(attestation) {
  const { signature, ...rest } = attestation || {};
  void signature; // dropped — signature is excluded from the hash
  return toHex(sha256(canonicalBytes(rest)));
}

// ---- signing --------------------------------------------------------------

/**
 * Sign the canonical bytes of an attestation (signature excluded) and return a
 * standard base64 signature plus the canonical string that was signed.
 * @param {object} attestation - attestation WITHOUT a signature field
 * @param {Uint8Array} privateKey
 * @returns {{ signature: string, canonical: string, canonicalBytes: Uint8Array }}
 */
export function signPayload(attestation, privateKey) {
  const bytes = canonicalBytes(attestation);
  const sig = ed.sign(bytes, privateKey); // 64-byte signature
  return {
    signature: toBase64(sig),
    canonical: canonicalize(attestation),
    canonicalBytes: bytes,
  };
}

/**
 * Verify a base64 signature against an attestation (used by the self-test and
 * the local round-trip check before submit).
 * @param {string} base64Signature
 * @param {object} attestation - WITHOUT a signature field
 * @param {Uint8Array} publicKey
 * @returns {boolean}
 */
export function verifyPayload(base64Signature, attestation, publicKey) {
  const sig = fromBase64(base64Signature);
  return ed.verify(sig, canonicalBytes(attestation), publicKey);
}
