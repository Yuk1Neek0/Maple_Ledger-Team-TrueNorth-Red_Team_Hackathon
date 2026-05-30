export const ACTION_TYPES = [
  "raw_material_supply",
  "component_manufacture",
  "subassembly",
  "final_integration",
];

export const STEP_TYPE_LABEL = {
  raw_material_supply: "SOURCE",
  component_manufacture: "TRANSFORM",
  subassembly: "ASSEMBLE",
  final_integration: "INTEGRATE",
};

export const SUBSTANTIAL_TRANSFORM_HOURS = 4;

export function newAttestationId() {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return `att-${uuid}`;
}

export function emptyParent() {
  return { attestation_id: "", content_hash: "", quantity_consumed: "1", unit: "units" };
}

export function defaultForm() {
  return {
    attestation_id: newAttestationId(),
    version: "1.0",
    supplier_id: "sup-avss-corp",
    timestamp: "2026-03-21T14:30:00Z",
    action_type: "component_manufacture",
    performed_in_country: "CA",
    parents: [
      {
        attestation_id: "att-anchor-0001",
        content_hash: "1ed6d6cc7b1526c7473ad8532a6f8ae5e17470bc09434f5da51e9d33c2cddaa4",
        quantity_consumed: "8",
        unit: "m2",
      },
    ],
    output_name: "Parachute Recovery Assembly",
    output_quantity: "1",
    output_unit: "units",
    material_cad: "0",
    labour_hours: "6.5",
    labour_cost_cad: "520",
  };
}

export function buildPayload(form) {
  const toNum = (v) => {
    const t = String(v).trim();
    if (t === "") return v;
    const n = Number(t);
    return Number.isFinite(n) ? n : v;
  };

  return {
    attestation_id: form.attestation_id.trim(),
    version: form.version.trim(),
    supplier_id: form.supplier_id.trim(),
    timestamp: form.timestamp.trim(),
    action_type: form.action_type,
    performed_in_country: form.performed_in_country.trim().toUpperCase(),
    parents: form.parents.map((p) => ({
      attestation_id: p.attestation_id.trim(),
      content_hash: p.content_hash.trim().toLowerCase(),
      quantity_consumed: toNum(p.quantity_consumed),
      unit: p.unit.trim(),
    })),
    output: {
      name: form.output_name.trim(),
      quantity_produced: toNum(form.output_quantity),
      unit: form.output_unit.trim(),
    },
    costs: {
      material_cad: toNum(form.material_cad),
      labour_hours: toNum(form.labour_hours),
      labour_cost_cad: toNum(form.labour_cost_cad),
    },
  };
}
