// Ed25519 signing in the browser via @noble/ed25519.
//
// @noble/ed25519 v3's synchronous API requires a SHA-512 implementation to be
// injected; we wire in @noble/hashes. This must run before any sign/getPublicKey
// call, so we do it at module load.
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { canonicalBytes } from "./canonical.js";

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

// ---- keys -----------------------------------------------------------------

/**
 * Generate a fresh Ed25519 keypair.
 * @returns {{ privateKey: Uint8Array, publicKey: Uint8Array, privateHex: string, publicHex: string }}
 */
export function generateKeypair() {
  const privateKey = ed.utils.randomSecretKey(); // 32-byte seed
  const publicKey = ed.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    privateHex: toHex(privateKey),
    publicHex: toHex(publicKey),
  };
}

/**
 * Derive a public key from a pasted 32-byte hex private key (seed).
 * @param {string} privateHex
 * @returns {{ privateKey: Uint8Array, publicKey: Uint8Array, privateHex: string, publicHex: string }}
 */
export function keypairFromPrivateHex(privateHex) {
  const privateKey = fromHex(privateHex);
  if (privateKey.length !== 32) {
    throw new Error("Ed25519 private key must be 32 bytes (64 hex chars)");
  }
  const publicKey = ed.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    privateHex: toHex(privateKey),
    publicHex: toHex(publicKey),
  };
}

// ---- signing --------------------------------------------------------------

/**
 * Sign the canonical bytes of a payload and return a standard base64 signature.
 * @param {object} payload - attestation payload WITHOUT a signature field
 * @param {Uint8Array} privateKey
 * @returns {{ signature: string, canonical: string, canonicalBytes: Uint8Array }}
 */
export function signPayload(payload, privateKey) {
  const bytes = canonicalBytes(payload);
  const sig = ed.sign(bytes, privateKey); // 64-byte signature
  return {
    signature: toBase64(sig),
    canonical: new TextDecoder().decode(bytes),
    canonicalBytes: bytes,
  };
}

/**
 * Verify a base64 signature against a payload (used by the self-test).
 * @param {string} base64Signature
 * @param {object} payload
 * @param {Uint8Array} publicKey
 * @returns {boolean}
 */
export function verifyPayload(base64Signature, payload, publicKey) {
  const sig = Uint8Array.from(atob(base64Signature), (c) => c.charCodeAt(0));
  return ed.verify(sig, canonicalBytes(payload), publicKey);
}
