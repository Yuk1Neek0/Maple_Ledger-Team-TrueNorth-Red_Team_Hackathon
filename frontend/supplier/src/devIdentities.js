// DEV-ONLY demo identities for the issuing console.
//
// These are REAL registered suppliers from the challenge kit. Each value is a
// 32-byte Ed25519 private-key SEED, base64-encoded, copied verbatim from
// provenance-kit/private_keys/supplier_private_keys.json. The kit ships every
// private key on purpose — the threat model is malicious chains, not key theft —
// so loading one lets the supplier UI sign as a *registered* identity whose
// signature the verifier accepts (it derives to the public key in
// provenance-kit/registry/supplier_public_keys.json).
//
// The first four are the worked-example suppliers (recovery drone), so an
// authored attestation can slot straight into that chain.
export const DEMO_IDENTITIES = {
  "sup-porcher": "kF7J0Q0We8kT79N6nuhCptUetmpgXdfAEAlMWTyash4=",
  "sup-avss-corp": "xPR4piRUhyOpJpZAVfMlKl0FimXWDib0C2gsHuZelbs=",
  "sup-nanuk": "ZK1D1Cyeyiz6+8lqfQu6V7w16A+QC+vkFI4b3/dVjiE=",
  "sup-mcmaster": "LgxsjU5Gbe1mLJ8Rmlz/td3aU5ZX/mY4NlZEBYllc1Y=",
  "sup-0001": "7J2DNSBdMq1FAKYSyf7dnzyVE0YRyR1alX3qnJhve/U=",
  "sup-0002": "Y7xwCZQs4F3RtUQ/Ru5py0Mb97ur7jZb2vb+pcz1Rp4=",
};
