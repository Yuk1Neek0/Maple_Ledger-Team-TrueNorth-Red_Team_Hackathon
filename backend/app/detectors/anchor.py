"""Lane E — anchor-registry detectors (anchor_mismatch, replay_cross_chain).

The anchor registry (provenance-kit/registry/anchor_registry.json) is the
challenge's published, signed ledger of GENUINE attestations. Because every
supplier private key ships in the kit, an attacker can sign any chain; the
registry is the one thing they cannot forge. For each submitted attestation
whose `attestation_id` is anchored, the spec (spec/anchor-registry.md) gives two
checks:

  * **anchor_mismatch** — recompute the attestation's content hash; if it differs
    from the anchored `content_hash`, the content was rewritten after issuance.
  * **replay_cross_chain** — the anchored attestation appears in a submission for
    a DIFFERENT `product_id` than the single product it was anchored under
    (cross-product reuse).

CRITICAL (spec §"the registry is NOT exhaustive"): absence from the registry is
NOT a violation. New products legitimately ship with unanchored attestations.
We therefore act ONLY on attestation_ids that ARE anchored, and stay silent on
everything else.

The verify engine builds VerifyContext with an empty `anchor_index`, so this
module loads the registry itself — ONCE at import — mirroring registry.py's
`_default_path()` resolution order (env override -> container mount -> vendored
repo copy).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from .base import VerifyContext, anomaly

# backend/app/detectors/anchor.py -> parents[3] == repo root (mirrors registry.py).
_REPO = Path(__file__).resolve().parents[3]
_REAL = _REPO / "provenance-kit" / "registry" / "anchor_registry.json"


def _default_path() -> Path:
    """Env override, then the container mount, then the vendored real registry.

    Mirrors backend/app/registry.py: the Dockerfile copies provenance-kit/registry
    to /registry, so the anchor file lives at /registry/anchor_registry.json in
    the image; locally it is the vendored repo copy."""
    env = os.environ.get("ML_ANCHOR_REGISTRY_PATH")
    if env:
        return Path(env)
    container = Path("/registry/anchor_registry.json")
    if container.exists():
        return container
    return _REAL


def _load_anchor_index(path: Path | str | None = None) -> dict[str, tuple[str, str]]:
    """Load anchors into { attestation_id: (content_hash, product_id) }.

    Best-effort: a missing or malformed registry yields an empty index so the
    detector simply stays silent (it never blocks /verify). The registry
    signature is the authority's guarantee; we are a downstream consumer and do
    not need the authority private key to use the anchors."""
    p = Path(path) if path else _default_path()
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    index: dict[str, tuple[str, str]] = {}
    for entry in raw.get("anchors", []) or []:
        att_id = entry.get("attestation_id")
        content_hash = entry.get("content_hash")
        product_id = entry.get("product_id")
        # An anchor without an id is unusable; without a content_hash we cannot
        # do the content check; product_id may legitimately be absent.
        if att_id and content_hash:
            index[att_id] = (content_hash, product_id)
    return index


# Loaded ONCE at module import (the engine never populates ctx.anchor_index).
ANCHOR_INDEX: dict[str, tuple[str, str]] = _load_anchor_index()


def detect(ctx: VerifyContext) -> list:
    """Flag anchored attestations that were rewritten or reused cross-product.

    Conservative by construction: we touch ONLY attestation_ids present in the
    anchor registry. Unanchored attestations (the majority — new products) are
    never flagged here, so this detector cannot regress a clean chain whose ids
    are not anchored. Each anomaly references the node's recomputed content hash;
    the response mapper translates that to the attestation_id."""
    index = ANCHOR_INDEX
    if not index:
        return []

    out: list = []
    current_product = ctx.product_attestation_id

    for att_id, node in ctx.nodes_by_att_id.items():
        anchored = index.get(att_id)
        if anchored is None:
            continue  # absence from the registry is NOT a violation
        anchored_hash, anchored_product = anchored

        # anchor_mismatch: the submitted attestation's recomputed content hash
        # diverges from the anchored one -> the content was rewritten.
        if node.hash != anchored_hash:
            out.append(anomaly(
                "anchor_mismatch", node.hash,
                f"attestation {att_id} is anchored with content_hash "
                f"{anchored_hash[:16]}... but the submitted content hashes to "
                f"{node.hash[:16]}... (content rewritten)",
            ))

        # replay_cross_chain: the anchored attestation is being submitted under a
        # different product than the single product it was anchored to. Guard on a
        # present anchored_product, and only flag a genuine product mismatch.
        if (
            anchored_product
            and current_product
            and anchored_product != current_product
        ):
            out.append(anomaly(
                "replay_cross_chain", node.hash,
                f"attestation {att_id} is anchored to product {anchored_product} "
                f"but appears in the chain for product {current_product} "
                f"(cross-product reuse)",
            ))

    return out
