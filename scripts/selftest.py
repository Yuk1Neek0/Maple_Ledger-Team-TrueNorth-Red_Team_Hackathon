"""One-command self-test (WS6.2): unit suite + (if a backend is up) live e2e.

    python scripts/selftest.py

Always runs the backend pytest suite. Runs scripts/e2e_check.py only if a backend
answers http://127.0.0.1:8000/health (otherwise skips — not a failure). Exits
nonzero on any failure. Stdlib only, cross-platform.
"""
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run(cmd, cwd) -> int:
    print(f"\n$ {' '.join(cmd)}   (cwd={cwd.name})")
    return subprocess.run(cmd, cwd=str(cwd)).returncode


def _backend_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def main() -> None:
    failures = []

    if _run([sys.executable, "-m", "pytest", "-q"], ROOT / "backend") != 0:
        failures.append("pytest")

    if _backend_up():
        if _run([sys.executable, "scripts/e2e_check.py"], ROOT) != 0:
            failures.append("e2e_check")
    else:
        print("\n[skip] no backend at http://127.0.0.1:8000 — skipping live e2e "
              "(run `docker compose up -d` to include it).")

    print("\n" + ("SELFTEST FAILED: " + ", ".join(failures) if failures else "SELFTEST PASSED"))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
