"""Lane B — NEW structural detectors.

Three net-new structural anomaly classes, all keyed on the parent references a
CHILD attestation declares (the corpus always labels the *child* — the consumer
that carries the bad reference — never the parent):

- ``parent_hash_mismatch`` — the child claims a ``parents[].content_hash`` that
  differs from the parent's actual recomputed content hash. (The engine already
  flags the same child as a ``BROKEN_LINK``/``dangling_parent`` because the bad
  hash fails to resolve to a present node; we add the correct ``type`` label so
  the classification bonus lands. The response mapper dedups by
  ``(attestation_id, type)``, so the overlap is harmless.)
- ``unit_mismatch`` — the child consumes a parent in a unit different from that
  parent's ``output.unit``.
- ``dangling_parent`` — the child references a ``parents[].attestation_id`` that
  is not present in the submitted chain. (Attackers fabricate the missing
  parent's ``content_hash`` to a real present node, so the engine's
  content-hash-based ``BROKEN_LINK`` check misses it; detection must rekey on
  ``attestation_id``.)

Each anomaly is reported on the CHILD node's content hash; the response mapper
translates hash → attestation_id. Pure & additive & conservative: every branch
only fires on a concrete, verifiable discrepancy, so clean chains stay clean.
"""
from __future__ import annotations

from .base import VerifyContext, anomaly


def detect(ctx: VerifyContext) -> list:
    out: list = []
    for node in ctx.nodes_by_hash.values():
        child_hash = node.hash
        for ref in node.attestation.inputs:
            parent_id = ref.parent_id

            # dangling_parent: the referenced parent attestation_id is absent
            # from the submission. Rekey on attestation_id (not content_hash):
            # attackers set the fake ref's content_hash to a real node, so the
            # engine's hash-based BROKEN_LINK check does not catch this.
            if parent_id and parent_id not in ctx.nodes_by_att_id:
                out.append(anomaly(
                    "dangling_parent", child_hash,
                    f"parent {parent_id} not in submission",
                ))
                continue  # parent absent -> hash/unit checks below are moot

            parent = ctx.nodes_by_att_id.get(parent_id)
            if parent is None:
                # No parent_id to resolve (or unresolved) — nothing structural
                # to compare against; leave it to the engine's link checks.
                continue

            # parent_hash_mismatch: claimed parent content_hash != the parent's
            # actual recomputed content hash.
            if ref.attestation_hash and ref.attestation_hash != parent.hash:
                out.append(anomaly(
                    "parent_hash_mismatch", child_hash,
                    f"content_hash mismatch for parent {parent_id}",
                ))

            # unit_mismatch: the unit the child claims to consume differs from
            # the parent's declared output unit.
            parent_unit = parent.attestation.output.unit
            if ref.unit and parent_unit and ref.unit != parent_unit:
                out.append(anomaly(
                    "unit_mismatch", child_hash,
                    f"consumes {ref.unit} but parent outputs {parent_unit}",
                ))

    return out
