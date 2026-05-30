import { verifyChain } from "../api.js";
import { buildGraph, costAttribution, criticality } from "../chain.js";

export function buildVerificationView(chain, result) {
  if (!chain || !result) {
    return {
      graph: null,
      cost: null,
      criticality: null,
    };
  }

  return {
    graph: buildGraph(
      chain.attestations,
      result.anomalies,
      chain.product_attestation_id
    ),
    cost: costAttribution(chain.attestations),
    criticality: criticality(chain.attestations),
  };
}

export async function createVerification(chain) {
  const result = await verifyChain(chain);
  return {
    verification_id: null,
    source: "challenge_verify",
    product_attestation_id: chain.product_attestation_id,
    result,
    ...buildVerificationView(chain, result),
  };
}
