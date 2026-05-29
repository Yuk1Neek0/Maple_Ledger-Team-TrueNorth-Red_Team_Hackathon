"""Mass-balance / quantity-overdraw check (A4).

For each producer node, sum the quantity its consumers claim to have used and
compare against what it output. Overdraw = a chain claiming more material than
upstream ever produced. Hard reject (build-execution-plan §3.1 decision).
"""
from __future__ import annotations


def check(chain) -> dict[str, str]:
    """Return {producer_hash: detail} for every overdrawn producer."""
    over: dict[str, str] = {}
    for h, node in chain.by_hash.items():
        produced = node.attestation.output.quantity
        consumed = 0
        for c in node.consumer_hashes:
            for ref in chain.by_hash[c].attestation.inputs:
                if ref.attestation_hash == h:
                    consumed += ref.quantity_used
        if consumed > produced:
            over[h] = f"consumed {consumed} > produced {produced}"
    return over
