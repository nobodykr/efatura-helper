"""Minimal FastAPI adapter for the isolated market store; no account or body logging."""

import hmac
import json
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .storage import IntakeError, MarketStore

DB = os.environ.get("FISCALIDADE_MARKET_DB", "/data/fiscalidade-market.db")
PEPPER = os.environ.get("FISCALIDADE_MARKET_PEPPER", "")
PEPPER_FILE = os.environ.get("FISCALIDADE_MARKET_PEPPER_FILE", "")
if not PEPPER and PEPPER_FILE:
    PEPPER = Path(PEPPER_FILE).read_text(encoding="ascii").strip()
if not PEPPER:
    raise RuntimeError("FISCALIDADE_MARKET_PEPPER is required")
API_KEY = os.environ.get("FISCALIDADE_MARKET_API_KEY", "")
API_KEY_FILE = os.environ.get("FISCALIDADE_MARKET_API_KEY_FILE", "")
if not API_KEY and API_KEY_FILE:
    API_KEY = Path(API_KEY_FILE).read_text(encoding="ascii").strip()
if len(API_KEY.encode("utf-8")) < 32:
    raise RuntimeError("FISCALIDADE_MARKET_API_KEY is required")

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
        supplied_key = request.headers.get("x-fiscalidade-market-key", "")
        if not hmac.compare_digest(supplied_key.encode("utf-8"), API_KEY.encode("utf-8")):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if not (request.headers.get("content-type") or "").lower().startswith("application/json"):
            return JSONResponse({"error": "json_required"}, status_code=415)
        chunks = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 1024 * 1024:
                return JSONResponse({"error": "body_too_large"}, status_code=413)
            chunks.append(chunk)
        payload = json.loads(b"".join(chunks))
        return store.ingest(payload)
    except json.JSONDecodeError:
        return JSONResponse({"error": "bad_json"}, status_code=400)
    except IntakeError as error:
        return JSONResponse({"error": str(error)}, status_code=422)
    except Exception:
        return JSONResponse({"error": "intake_failed"}, status_code=500)


@app.get("/health")
async def health():
    return {"ok": True}
