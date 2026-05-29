"""Claude API spike (WS5.1): confirm ANTHROPIC_API_KEY works end-to-end.

Usage: python scripts/spike_claude.py
Put the key in backend/.env (ANTHROPIC_API_KEY=...) or the environment.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import llm  # noqa: E402

if not llm.available():
    print("ANTHROPIC_API_KEY not set — put it in backend/.env. Skipping live call.")
    sys.exit(0)

print(f"model: {llm.MODEL}")
print("reply:", llm.complete("You are a terse assistant.", "Reply with exactly: pong"))
