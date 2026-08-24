"""Minimal FastAPI adapter for the isolated market store; no account or body logging."""

import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .storage import IntakeError, MarketStore

DB = os.environ.get("FISCALIDADE_MARKET_DB", "/data/fiscalidade-market.db")
PEPPER = os.environ.get("FISCALIDADE_MARKET_PEPPER", "")
if not PEPPER:
    raise RuntimeError("FISCALIDADE_MARKET_PEPPER is required")

store = MarketStore(DB, PEPPER)
app = FastAPI(title="Fiscalidade market intake", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["cache-control"] = "no-store"
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["x-robots-tag"] = "noindex, nofollow, noarchive"
    return response


@app.post("/api/v1/intake")
async def intake(request: Request):
    try:
        payload = await request.json()
        return store.ingest(payload)
    except IntakeError as error:
        return JSONResponse({"error": str(error)}, status_code=422)
    except Exception:
        return JSONResponse({"error": "intake_failed"}, status_code=500)
