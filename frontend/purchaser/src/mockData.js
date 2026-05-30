// Demo hash chips (P3.4) — one-click verify against seeded fixtures.
// Synced from `data/tools/gen_mock.py` — run `python data/tools/gen_mock.py`
// then `python scripts/seed.py` against a live backend before demoing.
//
// Curated subset (out of 19 fixtures): the 8 that tell the strongest story
// in the right order — pass, tamper, replay, structural, advisory.
export const DEMO_HASHES = [
  { label: "Happy path (MIC)", tone: "ok", hash: "13e72f89a1397084868ee6aaf006d47e2832b6f1c60b14c8279ff11207e77ef5" },
  { label: "Product of Canada", tone: "ok", hash: "55af226c7ead88f56c7e76588d0090f98ce6c208c32653fef58636c58eb53b1a" },
  { label: "Foreign assembly → NONE", tone: "fail", hash: "93c11364caed22eb5f949b6e3c07917b88563d293ac91c636b36c8538c50ae79" },
  { label: "Tampered → SIG fail", tone: "fail", hash: "8d3b6b4811e6fd82126165f3d50f280a00aa9261393ae0ec2399c621cba0896f" },
  { label: "Overdraw (mass-bal)", tone: "fail", hash: "b55e0f9aa40a9cad509399583ff4c964b8ebe901496eec2cbbecdb7ca135195b" },
  { label: "Under 51%", tone: "fail", hash: "4fbe92bf7a0e8de6b968c74b970549ba0d9ce19707338e5fbfdbf476f89e39b3" },
  { label: "Deep chain (20 nodes)", tone: "ok", hash: "ddb1ad0300d899ea3b53d969d2c8231e11de32c42c1d3544330484880fe0eb07" },
  { label: "Anomaly (advisory)", tone: "advisory", hash: "5303e4aadd97aadb8115c2b052e753b17d2d06fec1ac0e64c8d3f2354259427e" },
];

// Mock fixtures used while the real verifier engine is being built in parallel.
//
// `mockVerificationResult` matches the EXACT /verify/{root_hash} response shape
// the backend will return. `mockGraph` matches the provenance-graph shape the
// frontend renders (topology is NOT yet part of the /verify response, so it is
// supplied separately and will be wired to real data at integration).

// ---- /verify/{root_hash} response ------------------------------------------
export const mockVerificationResult = {
  designation: "MADE_IN_CANADA", // MADE_IN_CANADA | PRODUCT_OF_CANADA | NONE
  canadian_pct: 0.966, // 0..1 float, shown as %
  total_cost_cents: 1470,
  canadian_cost_cents: 1420,
  cost_by_country: { CA: 1420, CN: 50 },
  anomalies: [
    {
      reason: "SIGNATURE_INVALID",
      attestation_hash: "a3f19c4e7b2d8f01",
      detail:
        "Signature on the motor-controller attestation does not verify against the registered public key.",
      advisory: false,
    },
    {
      reason: "ANOMALY",
      attestation_hash: "7d2b0a91ffcc1e44",
      detail:
        "Stated stage cost is unusually high versus comparable suppliers — flagged for review.",
      advisory: true,
    },
  ],
};

// A clean "all good, fully Canadian" alternative for demoing the happy path.
export const mockVerificationResultClean = {
  designation: "PRODUCT_OF_CANADA",
  canadian_pct: 1.0,
  total_cost_cents: 1420,
  canadian_cost_cents: 1420,
  cost_by_country: { CA: 1420 },
  anomalies: [],
};

// A failing result for demoing the red verdict.
export const mockVerificationResultFail = {
  designation: "NONE",
  canadian_pct: 0.12,
  total_cost_cents: 2000,
  canadian_cost_cents: 240,
  cost_by_country: { CN: 1500, US: 260, CA: 240 },
  anomalies: [
    {
      reason: "BROKEN_LINK",
      attestation_hash: "0011223344556677",
      detail: "Referenced input attestation could not be found in the chain.",
      advisory: false,
    },
  ],
};

// ---- provenance graph (separate from /verify until integration) ------------
export const mockGraph = {
  nodes: [
    {
      id: "root00",
      label: "drone_x1\nSUP-ASSEMBLY · CA",
      country: "CA",
      status: "OK",
    },
    {
      id: "frame0",
      label: "airframe\nSUP-FRAME · CA",
      country: "CA",
      status: "OK",
    },
    {
      id: "motor0",
      label: "motor_housing\nSUP-MOTOR · CA",
      country: "CA",
      status: "OK",
    },
    {
      id: "ctrl00",
      label: "motor_controller\nSUP-CTRL · CA",
      country: "CA",
      status: "INVALID",
    },
    {
      id: "imu000",
      label: "imu_sensor\nSUP-IMU · CN",
      country: "CN",
      status: "OK",
    },
    {
      id: "alum00",
      label: "aluminium_stock\nSUP-ALU · CA",
      country: "CA",
      status: "OK",
    },
  ],
  edges: [
    { source: "frame0", target: "root00" },
    { source: "motor0", target: "root00" },
    { source: "ctrl00", target: "root00" },
    { source: "imu000", target: "ctrl00" },
    { source: "alum00", target: "frame0" },
    { source: "alum00", target: "motor0" },
  ],
};
