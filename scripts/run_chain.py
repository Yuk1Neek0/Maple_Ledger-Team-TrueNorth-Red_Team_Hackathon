"""Ingest an arbitrary chain JSON and run verify (WS4.7 — the kickoff harness).

On event day, drop the provided sample chain in and confirm it flows through the
already-built pipeline:

    python scripts/run_chain.py <chain.json> [root_hash]

The file may be a fixture-style object {root_hash, attestations:[...]} or a bare
list of attestation wire dicts (then pass the root hash as the 2nd argument).
Variant selection (serialization / ST rule / cost-flow / registry shape) is
controlled by backend/app/spec.py + env vars — see developing/kickoff-checklist.md.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import adapters  # noqa: E402
from app.registry import load_registry  # noqa: E402
from app.verify import result_to_dict, verify_root  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python scripts/run_chain.py <chain.json> [root_hash]")
        sys.exit(2)

    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    atts = data["attestations"] if isinstance(data, dict) else data
    root = sys.argv[2] if len(sys.argv) > 2 else (
        data.get("root_hash") if isinstance(data, dict) else None
    )

    store: dict[str, dict] = {}
    for obj in atts:
        try:
            store[adapters.compute_hash(adapters.attestation_from_dict(obj))] = obj
        except Exception as e:  # degrade gracefully — report and continue
            print(f"  skip malformed attestation: {e}")

    if not root:
        print("error: no root_hash supplied or derivable from the file")
        sys.exit(2)

    r = result_to_dict(verify_root(store, load_registry(), root))
    g = r.pop("graph", None) or {}
    print(json.dumps(r, indent=2))
    print(f"graph: {len(g.get('nodes', []))} nodes, {len(g.get('edges', []))} edges")


if __name__ == "__main__":
    main()
