# Red-Team-Hackathon — Maple Ledger

Cryptographic provenance for Canadian supply chains. Verifier backend + supplier
and purchaser UIs. Design docs live in `doc/` and `developing/`.

## Run the backend

Docker:

```
docker compose up --build
# GET http://localhost:8000/health  ->  {"status":"ok"}
```

Local (dev):

```
python -m venv .venv
.venv\Scripts\activate           # PowerShell:  .venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
python data/tools/gen_mock.py    # writes data/registry.json + backend/tests/fixtures/
uvicorn app.main:app --app-dir backend --reload
```

## Test

```
cd backend && python -m pytest -q
```

## Layout

- `backend/app/` — FastAPI service. `models.py` is the frozen internal model;
  the event-day spec only touches `adapters.py` (the six seams).
- `schema/`, `data/` — mock attestation schema + registry (swapped at kickoff).
- `frontend/supplier`, `frontend/purchaser` — the two demo UIs.

See `developing/build-execution-plan-en.md` for the task-by-task plan.
