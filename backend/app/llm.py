"""Key-optional Anthropic Claude client for the ADVISORY AI features (WS5).

NEVER used in the verdict path. Reads ANTHROPIC_API_KEY from the environment (or
backend/.env). If the key is absent, available() is False and callers return 503
— so the core system runs fine without it. Uses httpx (already a dependency); no
SDK, no new package.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

# Load backend/.env once if present (no hard dependency on python-dotenv).
_ENV = Path(__file__).resolve().parents[1] / ".env"
if _ENV.exists():
    for _line in _ENV.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = os.environ.get("ML_CLAUDE_MODEL", "claude-haiku-4-5-20251001")


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def complete(system: str, user: str, max_tokens: int = 1024) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    resp = httpx.post(
        API_URL,
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    data = resp.json()
    parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "".join(parts).strip()


def complete_json(system: str, user: str, max_tokens: int = 1024) -> dict:
    """complete() then parse a JSON object out of the reply (tolerant of code
    fences / surrounding prose)."""
    t = complete(system, user, max_tokens).strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.lower().startswith("json"):
            t = t[4:]
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1:
        t = t[start:end + 1]
    return json.loads(t)
