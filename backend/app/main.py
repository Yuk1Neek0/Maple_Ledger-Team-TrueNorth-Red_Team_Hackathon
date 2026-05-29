"""FastAPI app + the three locked routes (build-execution-plan §5 / DESIGN §11).

| POST | /attestations    | attestation JSON      | { "hash": "..." }
| GET  | /verify/{hash}    | path param            | VerificationResult JSON
| GET  | /health           | —                     | { "status": "ok" }

Service name `verifier-backend`, port 8000 — must match the event-day spec.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import adapters, llm, verify
from .registry import load_registry


@asynccontextmanager
async def lifespan(app: FastAPI):
    global REGISTRY
    try:
        REGISTRY = load_registry()
    except FileNotFoundError:
        REGISTRY = {}
    yield


app = FastAPI(title="Maple Ledger — verifier backend", lifespan=lifespan)

# Open CORS: the two UIs are separate Compose services hitting this API in-browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory attestation store: { content_hash: wire_dict }. SQLite swap is a
# drop-in later (DESIGN §12); in-memory is enough for the harness lifecycle.
STORE: dict[str, dict] = {}
REGISTRY: dict = {}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/attestations")
def post_attestation(obj: dict) -> dict:
    ok, err = adapters.validate(obj)
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    att = adapters.attestation_from_dict(obj)
    h = adapters.compute_hash(att)
    STORE[h] = obj
    return {"hash": h}


@app.get("/verify/{root_hash}")
def get_verify(root_hash: str) -> dict:
    result = verify.verify_root(STORE, REGISTRY, root_hash)
    return verify.result_to_dict(result)


@app.get("/registry")
def get_registry() -> dict:
    """Read-only view of the trusted supplier registry (public keys + verified
    flags). The system signs nothing here; this is the ground truth every
    signature is checked against (DESIGN §5)."""
    return {
        sid: {
            "public_key": entry["public_key"].public_bytes_raw().hex(),
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
