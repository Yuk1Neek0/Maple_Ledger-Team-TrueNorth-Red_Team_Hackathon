// DEV-ONLY demo identities (WS3.2).
//
// 32-byte Ed25519 seeds (hex) for the four mock suppliers, matching the public
// keys in data/registry.json. Derived deterministically by data/tools/gen_mock.py
// (sha256("maple-ledger-mock-v1::" + supplier_id)), and mirrored in the gitignored
// data/dev/dev_keys.json. Loading one lets the supplier UI sign as a *registered*
// identity, so an authored attestation verifies green.
//
// These are mock identities for the demo only — never production keys.
export const DEMO_IDENTITIES = {
  "SUP-ALU": "73fe43f5b3e6d240f2371abbef10e0498a3529c63669c9d93403c245b10d4f8f",
  "SUP-BEAR": "1bbfd26005d31c54d3fc00ef9e67040a74a6215b4f8c5a169db70dd9c109fc13",
  "SUP-MOTOR": "7e90c83c4bc5a0c389d289c6992427ca5a3cb420d9be2613ad5b43d3fe142c04",
  "SUP-DRONE": "19965dc11c0a54cb794126a82c3a40df1e0f02d30f51784af1f712670eea4ea4",
};
