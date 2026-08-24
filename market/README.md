# Fiscalidade market intake

This is a separate, write-only service for `POST /api/v1/intake`. It does not import, mount or
write the CAE database. Its SQLite file and deployment credentials must be separate from cae-db.

The browser sends only schema skeletons and eFatura aggregates for checksum-valid legal entities:
company NIF, year, rounded whole-euro totals, invoice count and sector counts. Browser-scoped HMAC
tokens are re-HMACed with `FISCALIDADE_MARKET_PEPPER`; neither token is a person/account ID.
Retries upsert instead of incrementing. Raw observations expire after 400 days. Company/year totals
are unavailable until at least 20 distinct scoped tokens contributed.

Required runtime values:

- `FISCALIDADE_MARKET_PEPPER`: random secret of at least 32 bytes.
- `FISCALIDADE_MARKET_DB`: dedicated SQLite path; defaults to `/data/fiscalidade-market.db`.

The Pages facade must point only `FISCALIDADE_MARKET_ORIGIN` (and optional dedicated Access service
credentials) at this service. Do not reuse `FISCALIDADE_API_ORIGIN` or cae-db credentials.
