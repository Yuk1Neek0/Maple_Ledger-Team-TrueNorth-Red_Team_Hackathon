"""Live end-to-end check against a running backend (non-Docker path).

POSTs each fixture's attestations, GETs /verify/{root_hash}, prints the verdict
and asserts the expected designation/reason. Usage: python scripts/e2e_check.py
"""
import json
import sys
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
FIX = Path(__file__).resolve().parents[1] / "backend" / "tests" / "fixtures"


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    return json.loads(urllib.request.urlopen(req).read())


def get(path):
    return json.loads(urllib.request.urlopen(BASE + path).read())


def main():
    assert get("/health") == {"status": "ok"}, "health failed"
    checks = [
        ("happy_path.json", "MADE_IN_CANADA", None),
        ("product_of_canada.json", "PRODUCT_OF_CANADA", None),
        ("foreign_assembly.json", "NONE", None),
        ("tampered.json", "NONE", "SIGNATURE_INVALID"),
        ("unknown_issuer.json", "NONE", "UNKNOWN_ISSUER"),
        ("broken_link.json", "NONE", "BROKEN_LINK"),
        ("overdraw.json", "NONE", "MASS_BALANCE"),
    ]
    failures = 0
    for name, want_desig, want_reason in checks:
        fx = json.loads((FIX / name).read_text(encoding="utf-8"))
        for att in fx["attestations"]:
            post("/attestations", att)
        r = get(f"/verify/{fx['root_hash']}")
        reasons = {a["reason"] for a in r["anomalies"]}
        ok = r["designation"] == want_desig and (want_reason is None or want_reason in reasons)
        flag = "OK " if ok else "FAIL"
        if not ok:
            failures += 1
        print(f"  [{flag}] {name:24} -> {r['designation']:18} "
              f"pct={r['canadian_pct']:.3f} reasons={sorted(reasons) or '-'}")
    print(f"\n{'ALL LIVE CHECKS PASSED' if not failures else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
