FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY schema /schema
COPY data/registry.json /data/registry.json
# Real spec registry (supplier public keys + anchor registry) for POST /verify.
COPY provenance-kit/registry /registry

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
