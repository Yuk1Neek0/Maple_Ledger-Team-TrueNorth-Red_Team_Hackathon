"""In-process self-test runner (Lane G).

Scores the backend against the labeled training corpus WITHOUT a running server.
Unlike `provenance-kit/self_test.py` (which POSTs to a live `/verify` URL), this
imports `app.verify` + `app.registry` directly and reuses self_test's
`score_case` for byte-identical scoring. One command, no Docker, no port.

    python scripts/run_selftest.py
    python scripts/run_selftest.py --limit 200

Prints the per-category table + overall, matching self_test.py's format. Exits 0
always (it is a score report, not a pass/fail gate) unless it cannot load the
corpus. Stdlib + the backend only.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
PKIT = ROOT / "provenance-kit"

# Import the backend (app.*) and the kit's scoring harness (self_test.score_case)
# in-process. The kit dir must precede nothing problematic; both are additive.
for p in (str(BACKEND), str(PKIT)):
    if p not in sys.path:
        sys.path.insert(0, p)

from app import registry, verify  # noqa: E402
import self_test as st  # noqa: E402  (provenance-kit/self_test.py)

CORPUS = PKIT / "training_corpus.jsonl"


def score_corpus(limit: int = 0) -> tuple[float, dict, int]:
    """Run every corpus case through verify_chain in-process and score it.

    Returns (overall_fraction, per_category_aggregate, n_cases). The aggregate
    maps attack-category -> [summed_score, count].
    """
    reg = registry.load_registry()
    rows = [json.loads(line) for line in CORPUS.open(encoding="utf-8")]
    if limit:
        rows = rows[:limit]

    agg: dict[str, list] = defaultdict(lambda: [0.0, 0])
    total = 0.0
    for row in rows:
        chain = row["chain"]
        labels = row["labels"]
        kind = labels.get("attack", "clean")
        try:
            res, c = verify.verify_chain(
                reg, chain["product_attestation_id"], chain["attestations"]
            )
            resp = verify.to_verify_response(res, c, chain["product_attestation_id"])
            s = st.score_case(kind, labels, labels.get("t4_perturbed", []), resp)
        except Exception:
            s = 0.0
        total += s
        agg[kind][0] += s
        agg[kind][1] += 1

    return (total / len(rows) if rows else 0.0), agg, len(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0, help="grade only the first N cases")
    args = ap.parse_args()

    if not CORPUS.exists():
        print(f"ERROR: corpus not found at {CORPUS}", file=sys.stderr)
        sys.exit(2)

    overall, agg, n = score_corpus(args.limit)

    print(f"\noverall: {overall * 100:.1f}%  ({n} cases)  [in-process]\n")
    print(f"{'category':28s}  avg     n")
    for k in sorted(agg):
        ssum, count = agg[k]
        print(f"{k:28s}  {ssum / count * 100:5.1f}  {count:4d}")


if __name__ == "__main__":
    main()
