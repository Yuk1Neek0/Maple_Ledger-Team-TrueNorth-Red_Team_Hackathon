// Helpers that turn a submitted chain (the request) + the real /verify response
// into the view models the existing UI components consume.
//
// The real /verify response has NO graph and NO cost breakdown — it returns only
// designation / percentage / chain_valid / anomalies. We already hold the chain
// we submitted, so we derive the provenance topology and the cost-by-country
// attribution locally, purely for display. The legal verdict still comes from
// the backend.

import workedExampleChain from "./worked_example_chain.json";
import tamperedExampleChain from "./tampered_example_chain.json";

export { workedExampleChain, tamperedExampleChain };

// Real action_type -> short display label for graph nodes.
const ACTION_LABEL = {
  raw_material_supply: "raw material",
  component_manufacture: "component",
  subassembly: "subassembly",
  final_integration: "final integration",
};

const ST_ACTIONS = new Set([
  "component_manufacture",
  "subassembly",
  "final_integration",
]);

/**
 * Build the Cytoscape graph ({nodes, edges}) from the submitted attestations.
 * An edge points from a consumed input (parent) to the consumer (child), which
 * matches the existing ProvenanceGraph "input -> consumer" convention.
 *
 * Nodes failing an integrity check (their attestation_id appears in `anomalies`)
 * are marked status: "INVALID" so they render red.
 *
 * @param {object[]} attestations
 * @param {object[]} anomalies - the response anomalies ([] when clean)
 * @param {string} productId - product_attestation_id (the leaf)
 */
export function buildGraph(attestations, anomalies, productId) {
  const list = Array.isArray(attestations) ? attestations : [];
  const flagged = new Set(
    (anomalies || []).map((a) => a.attestation_id).filter(Boolean)
  );

  const nodes = list.map((a) => {
    const country = a.performed_in_country || "";
    const isProduct = a.attestation_id === productId;
    const action = ACTION_LABEL[a.action_type] || a.action_type || "";
    const name = a.output?.name || a.attestation_id;
    return {
      id: a.attestation_id,
      // Two-line label kept for backwards-compat; the React Flow node renders
      // the discrete fields below instead.
      label: `${name}\n${a.supplier_id || "?"} · ${country}`,
      name,
      supplier: a.supplier_id || "?",
      country,
      status: flagged.has(a.attestation_id) ? "INVALID" : "OK",
      action_type: a.action_type,
      action_label: action,
      is_product: isProduct,
    };
  });

  const present = new Set(list.map((a) => a.attestation_id));
  const edges = [];
  for (const a of list) {
    for (const p of a.parents || []) {
      // Only draw edges to parents that are actually in the submitted chain;
      // a dangling parent shows up as the anomaly instead of a phantom node.
      if (present.has(p.attestation_id)) {
        edges.push({ source: p.attestation_id, target: a.attestation_id });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Local cost attribution for the calculation-detail view. Mirrors the backend
 * rule (FAQ): per attestation cost = material_cad + labour_cost_cad, attributed
 * to performed_in_country; flat sum over ALL attestations. labour_hours is NOT a
 * cost. Money is kept in CAD dollars (the real wire unit).
 *
 * @param {object[]} attestations
 * @returns {{ totalCad: number, canadianCad: number, byCountry: Record<string,number>,
 *             perNode: {id,name,supplier_id,country,cad}[] }}
 */
export function costAttribution(attestations) {
  const list = Array.isArray(attestations) ? attestations : [];
  const byCountry = {};
  let totalCad = 0;
  let canadianCad = 0;
  const perNode = [];

  for (const a of list) {
    const c = a.costs || {};
    const cad = (Number(c.material_cad) || 0) + (Number(c.labour_cost_cad) || 0);
    const country = a.performed_in_country || "??";
    byCountry[country] = (byCountry[country] || 0) + cad;
    totalCad += cad;
    if (country === "CA") canadianCad += cad;
    perNode.push({
      id: a.attestation_id,
      name: a.output?.name || a.attestation_id,
      supplier_id: a.supplier_id,
      country,
      cad,
    });
  }

  return { totalCad, canadianCad, byCountry, perNode };
}

/**
 * Advisory criticality lens, derived locally (the real response carries none).
 * A node is "critical" if it is a substantial transformation (ST action_type
 * with labour_hours >= 4) or has high value-add; "commodity" for raw material;
 * "standard" otherwise. value_add = labour_cost / (material + labour).
 */
export function criticality(attestations) {
  const list = Array.isArray(attestations) ? attestations : [];
  return list.map((a) => {
    const c = a.costs || {};
    const material = Number(c.material_cad) || 0;
    const labour = Number(c.labour_cost_cad) || 0;
    const hours = Number(c.labour_hours) || 0;
    const own = material + labour;
    const valueAdd = own > 0 ? labour / own : 0;
    const isST = ST_ACTIONS.has(a.action_type) && hours >= 4;
    let cls = "standard";
    if (a.action_type === "raw_material_supply") cls = "commodity";
    if (isST || valueAdd >= 0.6) cls = "critical";
    return {
      id: a.attestation_id,
      name: a.output?.name || a.attestation_id,
      supplier_id: a.supplier_id,
      country: a.performed_in_country || "",
      component_class: cls,
      value_add_pct: valueAdd,
    };
  });
}

/**
 * Parse a pasted JSON string into a {product_attestation_id, attestations}
 * chain. Accepts either the full request envelope, a bare attestations array,
 * or a single attestation. Throws a friendly error otherwise.
 */
export function parseChainInput(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON: ${e.message}`);
  }

  // Full request envelope.
  if (data && typeof data === "object" && Array.isArray(data.attestations)) {
    if (!data.product_attestation_id) {
      const leaf = inferLeaf(data.attestations);
      if (!leaf) throw new Error("Could not infer product_attestation_id; add it explicitly.");
      return { product_attestation_id: leaf, attestations: data.attestations };
    }
    return {
      product_attestation_id: data.product_attestation_id,
      attestations: data.attestations,
    };
  }

  // Bare array of attestations.
  if (Array.isArray(data)) {
    const leaf = inferLeaf(data);
    if (!leaf) throw new Error("Could not infer the product (leaf) attestation from the array.");
    return { product_attestation_id: leaf, attestations: data };
  }

  // Single attestation object.
  if (data && typeof data === "object" && data.attestation_id) {
    return { product_attestation_id: data.attestation_id, attestations: [data] };
  }

  throw new Error(
    "Expected { product_attestation_id, attestations: [...] }, an attestations array, or a single attestation."
  );
}

// The leaf is the attestation no other attestation consumes as a parent.
function inferLeaf(attestations) {
  const consumed = new Set();
  for (const a of attestations) {
    for (const p of a.parents || []) consumed.add(p.attestation_id);
  }
  const leaves = attestations
    .map((a) => a.attestation_id)
    .filter((id) => id && !consumed.has(id));
  return leaves.length === 1 ? leaves[0] : leaves[0] || null;
}
