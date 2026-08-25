# Fiscalidade market intake

This is a separate, write-only service for `POST /api/v1/intake`. It does not import, mount or
write the CAE database. Its SQLite file and deployment credentials must be separate from cae-db.

The browser sends only schema skeletons and eFatura aggregates for checksum-valid legal entities:
company NIF, year, rounded whole-euro totals, invoice count and sector counts. Browser-scoped HMAC
tokens are re-HMACed with `FISCALIDADE_MARKET_PEPPER`; neither token is a person/account ID.
Retries upsert instead of incrementing. Raw observations expire after 400 days. Company/year totals
are unavailable until at least 20 distinct scoped tokens contributed.

The free profile flow requires a successful receipt from this service before a source counts as
complete. Every request must contain at least one endpoint ID from the fixed allowlist, and that ID
must belong to the submitted partition. Shape leaves are sanitized in the browser and again here;
unknown fields, arbitrary endpoints, buyer/person NIFs and individual invoice rows are rejected.

Required runtime values:

- `FISCALIDADE_MARKET_PEPPER`: random secret of at least 32 bytes, or mount a root-owned file and
  set `FISCALIDADE_MARKET_PEPPER_FILE` as the production Compose file does.
- `FISCALIDADE_MARKET_DB`: dedicated SQLite path; defaults to `/data/fiscalidade-market.db`.
- `FISCALIDADE_MARKET_API_KEY`: high-entropy facade credential, or a mounted file named by
  `FISCALIDADE_MARKET_API_KEY_FILE`. Direct tunnel requests without it are rejected.

The Pages facade must point only `FISCALIDADE_MARKET_ORIGIN` and `FISCALIDADE_MARKET_KEY` (plus
optional dedicated Access service credentials) at this service. Do not reuse
`FISCALIDADE_API_ORIGIN` or cae-db credentials.
