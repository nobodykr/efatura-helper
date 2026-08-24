"""Strict, privacy-minimized storage for the Fiscalidade market v1 intake contract."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PARTITIONS = {
    "efatura", "rendas", "situacao", "atividade", "atividade_integrada", "patrimonio",
    "irs", "movfin", "recibos", "declaracoes", "deducoes", "despesas_atividade", "ss",
}
ENDPOINT_ID = re.compile(r"^[a-z][a-z0-9.-]{1,63}\.v[0-9]+$")
TOKEN = re.compile(r"^[A-Za-z0-9_-]{43,86}$")
SECTOR = re.compile(r"^(?:C[0-9]{2}|UNCLASSIFIED)$")


class IntakeError(ValueError):
    """A rejected public payload. Messages are stable machine-readable codes."""


def legal_entity_nif(value: str) -> bool:
    if not re.fullmatch(r"[56][0-9]{8}", value or ""):
        return False
    total = sum(int(value[index]) * (9 - index) for index in range(8))
    digit = 11 - (total % 11)
    if digit >= 10:
        digit = 0
    return digit == int(value[8])


def _shape(value: Any, depth: int = 0) -> Any:
    """Keep only schema information; coerce unexpected leaves so values cannot be stored."""
    if depth > 6:
        return "..."
    if value is None:
        return None
    if isinstance(value, dict):
        if len(value) > 80:
            raise IntakeError("shape_too_wide")
        out = {}
        for key, child in value.items():
            if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_.:/-]{1,96}", key):
                raise IntakeError("bad_shape_key")
            out[key] = _shape(child, depth + 1)
        return out
    if isinstance(value, list):
        if len(value) > 3:
            raise IntakeError("shape_array_too_wide")
        return [_shape(child, depth + 1) for child in value]
    if isinstance(value, str):
        if re.fullmatch(r"(?:str(?:\([0-9]+\))?|number|boolean|undefined|\.\.\.|x[0-9]+)", value):
            return value
        return "string"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    raise IntakeError("bad_shape_value")


@dataclass(frozen=True)
class CompanyYear:
    nif: str
    year: int
    token: str
    invoice_count: int
    gross_eur: int
    vat_eur: int
    sector_counts: dict[str, int]


@dataclass(frozen=True)
class Intake:
    partition: str
    submission_token: str
    shapes: dict[str, Any]
    companies: tuple[CompanyYear, ...]


def validate(payload: Any) -> Intake:
    if not isinstance(payload, dict) or payload.get("contract") != 1 or payload.get("agreement") != "market-v1":
        raise IntakeError("bad_contract")
    if set(payload) != {"contract", "agreement", "partition", "submissionToken", "shapes", "companies"}:
        raise IntakeError("unknown_fields")
    partition = payload.get("partition")
    submission = payload.get("submissionToken")
    if partition not in PARTITIONS:
        raise IntakeError("bad_partition")
    if not isinstance(submission, str) or not TOKEN.fullmatch(submission):
        raise IntakeError("bad_submission_token")
    raw_shapes = payload.get("shapes", {})
    if not isinstance(raw_shapes, dict) or len(raw_shapes) > 25:
        raise IntakeError("bad_shapes")
    shapes = {}
    for endpoint, skeleton in raw_shapes.items():
        if not isinstance(endpoint, str) or not ENDPOINT_ID.fullmatch(endpoint):
            raise IntakeError("bad_endpoint")
        shapes[endpoint] = _shape(skeleton)

    raw_companies = payload.get("companies", [])
    if not isinstance(raw_companies, list) or len(raw_companies) > 5000:
        raise IntakeError("bad_companies")
    if partition != "efatura" and raw_companies:
        raise IntakeError("companies_wrong_partition")
    companies = []
    seen = set()
    for row in raw_companies:
        if not isinstance(row, dict):
            raise IntakeError("bad_company")
        if set(row) != {"nif", "year", "token", "invoiceCount", "grossEur", "vatEur", "sectorCounts"}:
            raise IntakeError("unknown_company_fields")
        nif, token = row.get("nif"), row.get("token")
        year = row.get("year")
        if not isinstance(nif, str) or not legal_entity_nif(nif):
            raise IntakeError("bad_company_nif")
        if not isinstance(token, str) or not TOKEN.fullmatch(token):
            raise IntakeError("bad_company_token")
        if not isinstance(year, int) or isinstance(year, bool) or not 2000 <= year <= 2100:
            raise IntakeError("bad_company_year")
        key = (nif, year)
        if key in seen:
            raise IntakeError("duplicate_company_year")
        seen.add(key)
        numbers = [row.get("invoiceCount"), row.get("grossEur"), row.get("vatEur")]
        if any(not isinstance(number, int) or isinstance(number, bool) for number in numbers):
            raise IntakeError("bad_company_totals")
        count, gross, vat = numbers
        if not 0 <= count <= 1_000_000 or abs(gross) > 1_000_000_000 or abs(vat) > 1_000_000_000:
            raise IntakeError("bad_company_totals")
        raw_sectors = row.get("sectorCounts", {})
        if not isinstance(raw_sectors, dict) or len(raw_sectors) > 100:
            raise IntakeError("bad_sector_counts")
        sectors = {}
        for sector, sector_count in raw_sectors.items():
            if not isinstance(sector, str) or not SECTOR.fullmatch(sector):
                raise IntakeError("bad_sector")
            if not isinstance(sector_count, int) or isinstance(sector_count, bool) or not 0 <= sector_count <= count:
                raise IntakeError("bad_sector_count")
            sectors[sector] = sector_count
        if sum(sectors.values()) != count:
            raise IntakeError("sector_count_mismatch")
        companies.append(CompanyYear(nif, year, token, count, gross, vat, sectors))
    return Intake(partition, submission, shapes, tuple(companies))


class MarketStore:
    def __init__(self, path: str | Path, pepper: str, retention_days: int = 400, k: int = 20):
        if len(pepper.encode("utf-8")) < 32:
            raise ValueError("pepper_must_be_at_least_32_bytes")
        self.path = str(path)
        self.pepper = pepper.encode("utf-8")
        self.retention_seconds = retention_days * 86400
        self.k = k
        self._schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=15000")
        return connection

    def _schema(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript("""
              CREATE TABLE IF NOT EXISTS company_year (
                token_hash TEXT NOT NULL, nif TEXT NOT NULL, year INTEGER NOT NULL,
                invoice_count INTEGER NOT NULL, gross_eur INTEGER NOT NULL, vat_eur INTEGER NOT NULL,
                sector_counts TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                PRIMARY KEY(token_hash, nif, year)
              );
              CREATE INDEX IF NOT EXISTS company_year_public ON company_year(nif, year, updated_at);
              CREATE TABLE IF NOT EXISTS shape_observation (
                submission_hash TEXT NOT NULL, partition_id TEXT NOT NULL, endpoint_id TEXT NOT NULL,
                shape_digest TEXT NOT NULL, shape_json TEXT NOT NULL,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                PRIMARY KEY(submission_hash, partition_id, endpoint_id)
              );
              CREATE INDEX IF NOT EXISTS shape_public ON shape_observation(endpoint_id, shape_digest, updated_at);
            """)

    def _hash(self, token: str) -> str:
        return hmac.new(self.pepper, token.encode("ascii"), hashlib.sha256).hexdigest()

    def ingest(self, raw: Any, now: int | None = None) -> dict[str, Any]:
        intake = validate(raw)
        timestamp = int(time.time() if now is None else now)
        submission_hash = self._hash(intake.submission_token)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            for endpoint, skeleton in intake.shapes.items():
                encoded = json.dumps(skeleton, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
                digest = hashlib.sha256(encoded.encode("ascii")).hexdigest()
                connection.execute("""
                  INSERT INTO shape_observation
                    (submission_hash,partition_id,endpoint_id,shape_digest,shape_json,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?)
                  ON CONFLICT(submission_hash,partition_id,endpoint_id) DO UPDATE SET
                    shape_digest=excluded.shape_digest, shape_json=excluded.shape_json, updated_at=excluded.updated_at
                """, (submission_hash, intake.partition, endpoint, digest, encoded, timestamp, timestamp))
            for row in intake.companies:
                token_hash = self._hash(row.token)
                sectors = json.dumps(row.sector_counts, sort_keys=True, separators=(",", ":"))
                connection.execute("""
                  INSERT INTO company_year
                    (token_hash,nif,year,invoice_count,gross_eur,vat_eur,sector_counts,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?)
                  ON CONFLICT(token_hash,nif,year) DO UPDATE SET
                    invoice_count=excluded.invoice_count, gross_eur=excluded.gross_eur,
                    vat_eur=excluded.vat_eur, sector_counts=excluded.sector_counts, updated_at=excluded.updated_at
                """, (token_hash, row.nif, row.year, row.invoice_count, row.gross_eur,
                      row.vat_eur, sectors, timestamp, timestamp))
            cutoff = timestamp - self.retention_seconds
            connection.execute("DELETE FROM company_year WHERE updated_at < ?", (cutoff,))
            connection.execute("DELETE FROM shape_observation WHERE updated_at < ?", (cutoff,))
        return {"ok": True, "accepted": {"shapes": len(intake.shapes), "companies": len(intake.companies)}}

    def public_company_year(self, nif: str, year: int) -> dict[str, Any] | None:
        """Release aggregate only after k distinct scoped browser tokens contributed."""
        if not legal_entity_nif(nif):
            return None
        with self._connect() as connection:
            row = connection.execute("""
              SELECT COUNT(DISTINCT token_hash) AS contributors,
                     SUM(invoice_count) AS invoice_count, SUM(gross_eur) AS gross_eur,
                     SUM(vat_eur) AS vat_eur
              FROM company_year WHERE nif=? AND year=?
            """, (nif, year)).fetchone()
        if not row or row["contributors"] < self.k:
            return None
        return dict(row) | {"nif": nif, "year": year}
