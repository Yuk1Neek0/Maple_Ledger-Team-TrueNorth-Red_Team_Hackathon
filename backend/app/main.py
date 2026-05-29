"""FastAPI app + the three locked routes (build-execution-plan §5 / DESIGN §11).

| POST | /attestations    | attestation JSON      | { "hash": "..." }
| GET  | /verify/{hash}    | path param            | VerificationResult JSON
| GET  | /health           | —                     | { "status": "ok" }

Service name `verifier-backend`, port 8000 — must match the event-day spec.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import adapters, verify
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
