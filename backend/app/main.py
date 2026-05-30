"""FastAPI app + the three locked routes (build-execution-plan §5 / DESIGN §11).

| POST | /attestations    | attestation JSON      | { "hash": "..." }
| GET  | /verify/{hash}    | path param            | VerificationResult JSON
| GET  | /health           | —                     | { "status": "ok" }

Service name `verifier-backend`, port 8000 — must match the event-day spec.
"""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import adapters, llm, verify
from .registry import load_registry
from .storage import Store, open_db


# Default DB path: repo-relative for dev, /data for container (writable mount).
def _default_db_path() -> str:
    env = os.environ.get("ML_DB_PATH")
    if env:
        return env
    container = Path("/data")
    if container.exists() and os.access(container, os.W_OK):
        return str(container / "ledger.db")
    return str(Path(__file__).resolve().parents[2] / "data" / "ledger.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global REGISTRY, STORE
    try:
        REGISTRY = load_registry()
    except FileNotFoundError:
        REGISTRY = {}
    STORE = open_db(_default_db_path())
    yield


app = FastAPI(title="Maple Ledger — verifier backend", lifespan=lifespan)

# Open CORS: the two UIs are separate Compose services hitting this API in-browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQLite-backed attestation store + append-only transparency log (P3.1).
# Replaces the previous in-memory dict. Tests can substitute via dependency
# injection or by reassigning `STORE` directly before client calls.
STORE: Store = None  # type: ignore[assignment]  # populated by lifespan
REGISTRY: dict = {}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/details")
def health_details() -> dict:
    """Extended health for demo-mode safety: tells the UI whether seed data is
    loaded so it can warn 'LIVE — NO DATA SEEDED' instead of silently returning
    NONE for every hash."""
    count = STORE.count_attestations() if STORE is not None else 0
    head = STORE.log_head() if STORE is not None else None
    return {
        "status": "ok",
        "store_count": count,
        "registry_count": len(REGISTRY),
        "log_head": head,
    }


@app.post("/attestations")
def post_attestation(obj: dict) -> dict:
    ok, err = adapters.validate(obj)
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    att = adapters.attestation_from_dict(obj)
    h = adapters.compute_hash(att)
    log = STORE.insert_attestation(h, obj)
    return {
        "hash": h,
        "log_seq": log["seq"] if log else None,
        "chain_hash": log["chain_hash"] if log else None,
    }


@app.post("/verify")
def post_verify(body: dict) -> dict:
    """Real spec contract (TECHNICAL_GUIDE §9 / 04 §10): verify a whole chain
    submitted in one request. Stateless — no store, no prior ingest.

    Request:  { "product_attestation_id": "...", "attestations": [ {...}, ... ] }
    Response: { product_attestation_id, canadian_content_percentage, designation,
                chain_valid, anomalies: [ {type, attestation_id, details} ] }
    """
    pid = (body or {}).get("product_attestation_id", "")
    atts = (body or {}).get("attestations", []) or []
    result, chain = verify.verify_chain(REGISTRY, pid, atts)
    return verify.to_verify_response(result, chain, pid)


@app.get("/verify/{root_hash}")
def get_verify(root_hash: str) -> dict:
    result = verify.verify_root(STORE, REGISTRY, root_hash)
    return verify.result_to_dict(result)


@app.get("/log/head")
def log_head() -> dict:
    """Most recent transparency-log entry (or None when empty). The chain_hash
    here commits to every prior log entry."""
    return {"head": STORE.log_head() if STORE is not None else None}


@app.get("/log/{attestation_hash}")
def log_entry(attestation_hash: str) -> dict:
    """Inclusion lookup: is this attestation hash in the transparency log?"""
    entry = STORE.log_entry_for(attestation_hash) if STORE is not None else None
    if entry is None:
        raise HTTPException(status_code=404, detail={"included": False})
    return {"included": True, "entry": entry}


@app.get("/registry")
def get_registry() -> dict:
    """Read-only view of the trusted supplier registry (public keys + verified
    flags). The system signs nothing here; this is the ground truth every
    signature is checked against (DESIGN §5)."""
    return {
        sid: {
            "public_key": entry["public_key"],  # base64 (reference_lib format)
            "verified": entry["verified"],
        }
        for sid, entry in REGISTRY.items()
    }


# ---- advisory AI (WS5) — never signs, never sets a verdict or reason ----
@app.post("/draft")
def post_draft(body: dict) -> dict:
    """ADVISORY: an LLM drafts an attestation from plain English. The draft is
    schema-checked and the human reviews/edits/signs it — the model never signs
    and never decides the verdict (build-adopt §4)."""
    if not llm.available():
        raise HTTPException(status_code=503, detail="AI authoring unavailable: set ANTHROPIC_API_KEY")
    text = (body or {}).get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="missing 'text'")
    system = (
        "You convert a supplier's plain-English description of ONE manufacturing "
        "step into a single attestation draft as STRICT JSON with EXACTLY these "
        "keys: supplier_id (string), output {product_id, quantity (integer), unit}, "
        "inputs (array of {attestation_hash, quantity_used}; [] unless explicit ids "
        "are given — never invent hashes), materials_cents (integer cents), "
        "labour_cents (integer cents), work_country (ISO-2 uppercase), "
        "is_substantial_transformation (boolean), timestamp (ISO-8601). "
        "Money is integer cents. Respond with ONLY the JSON object."
    )
    try:
        draft = llm.complete_json(system, text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"draft failed: {e}")
    # validate substantive fields (signature is added later, at signing time)
    check = {**draft, "signature": draft.get("signature") or "PLACEHOLDER"}
    ok, err = adapters.validate(check)
    notes = ("Schema-valid draft — review every field before signing."
             if ok else f"Draft needs fixes before signing: {err}")
    return {"draft": draft, "valid": ok, "notes": notes}


@app.post("/ask")
def post_ask(body: dict) -> dict:
    """ADVISORY natural-language verifier: the LLM reframes the question over the
    deterministic graph and cites attestation ids. Every number comes from the
    computed result, never from the model (build-adopt §2.8)."""
    if not llm.available():
        raise HTTPException(status_code=503, detail="AI verifier unavailable: set ANTHROPIC_API_KEY")
    q = (body or {}).get("question", "")
    root = (body or {}).get("root_hash", "")
    if not q.strip() or not root.strip():
        raise HTTPException(status_code=400, detail="missing 'question' or 'root_hash'")
    result = verify.result_to_dict(verify.verify_root(STORE, REGISTRY, root))
    graph = result.get("graph") or {"nodes": [], "edges": []}
    facts = {
        "designation": result["designation"],
        "canadian_pct": result["canadian_pct"],
        "cost_by_country": result["cost_by_country"],
        "anomalies": result["anomalies"],
        "nodes": graph["nodes"],
        "edges": graph["edges"],
    }
    system = (
        "You answer questions about a verified supply chain. Use ONLY the provided "
        "deterministic FACTS; never invent numbers. Cite the attestation node ids "
        'you relied on. Respond with STRICT JSON: {"answer": string, "citations": '
        "[node id strings]}."
    )
    try:
        out = llm.complete_json(system, f"FACTS:\n{json.dumps(facts)}\n\nQUESTION: {q}", 700)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ask failed: {e}")
    known = {n["id"] for n in graph["nodes"]}
    citations = [c for c in out.get("citations", []) if c in known]
    return {"answer": out.get("answer", ""), "citations": citations}
