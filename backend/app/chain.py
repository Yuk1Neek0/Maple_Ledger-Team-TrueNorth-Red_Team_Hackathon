"""SupplyChain: build the DAG, resolve references, topo-walk with cycle guard (A1).

Pure internal logic on the frozen model. Nodes are keyed by content hash; input
references are stored as hashes so a dangling edge is representable data (a
BROKEN_LINK), not a crash. Cycles are structurally impossible under content
addressing, but the Kahn guard defends against any input whose references
happen to form a loop.
"""
from __future__ import annotations

from .adapters import compute_hash
from .models import Attestation, Node


class SupplyChain:
    def __init__(self, by_hash: dict[str, Node], root_hash: str):
        self.by_hash = by_hash
        self.root_hash = root_hash

    def reachable(self) -> set[str]:
        """Hashes reachable from root by following present input edges."""
        seen: set[str] = set()
        stack = [self.root_hash]
        while stack:
            h = stack.pop()
            if h in seen or h not in self.by_hash:
                continue
            seen.add(h)
            for ref in self.by_hash[h].attestation.inputs:
                if ref.attestation_hash in self.by_hash:
                    stack.append(ref.attestation_hash)
        return seen

    def topo_walk(self) -> tuple[list[str], list[str]]:
        """Kahn's algorithm over the reachable subgraph (edges producer->consumer).
        Returns (leaves-first order, cycle_members). cycle_members is empty when
        the graph is acyclic; otherwise it is the set of reachable nodes that
        never got their in-degree to zero — i.e. the nodes participating in (or
        downstream of) the cycle. Tests treat any non-empty list as has_cycle."""
        nodes = self.reachable()
        indeg = {h: 0 for h in nodes}
        for h in nodes:
            for ref in self.by_hash[h].attestation.inputs:
                if ref.attestation_hash in nodes:
                    indeg[h] += 1  # h consumes a present input -> in-edge on h
        queue = [h for h in nodes if indeg[h] == 0]
        order: list[str] = []
        while queue:
            h = queue.pop()
            order.append(h)
            for c in self.by_hash[h].consumer_hashes:
                if c in indeg:
                    indeg[c] -= 1
                    if indeg[c] == 0:
                        queue.append(c)
        # Anything still with indeg>0 is on or downstream of a cycle.
        cycle_members = sorted(h for h, d in indeg.items() if d > 0)
        return order, cycle_members


def build_chain(attestations: list[Attestation], root_hash: str) -> SupplyChain:
    by_hash: dict[str, Node] = {}
    for att in attestations:
        h = compute_hash(att)
        by_hash[h] = Node(
            attestation=att,
            hash=h,
            input_hashes=[r.attestation_hash for r in att.inputs],
        )
    for h, node in by_hash.items():
        for ih in node.input_hashes:
            if ih in by_hash:
                by_hash[ih].consumer_hashes.append(h)
    return SupplyChain(by_hash, root_hash)
