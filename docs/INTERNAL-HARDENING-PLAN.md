# Fiscalidade internal hardening plan

Status: implemented and verified locally on `temporary review branch` on
2026-08-22. Public release remains blocked by the deferred work below.

This is the repository copy of the approved internal-only plan. It is deliberately versioned so
findings, decisions, tests and implementation commits do not exist only in chat history.

## Implementation result

- `/consulta`, `/contrato`, the free-text feedback endpoint, sitemap and all active bookmarklet
  installation surfaces are removed. Every HTML page and response is noindexed for internal review.
- The extension is Manifest V3 with five exact official hosts, bundled runtime/data, extension-owned
  storage, end-of-day expiry and a two-step authorize/read flow. Its explicit 12-file ZIP allowlist
  builds deterministically.
- The first-party API facade has a fixed HTTPS upstream, explicit route/method allowlist, 64 KiB body
  cap, minimized headers and bounded query handling. Contributions are separate and off by default.
- e-Fatura reads split capped ranges until complete or fail visibly. Attributed states `R`, `B` and
  `E` consume ceilings; `P` is pending. Unsupported rental recommendations and unvalidated PDF
  monetary parsing fail closed.
- Statutory values are synchronized across HTML, Markdown, code and snapshots. The 2025 rent limit
  is 700 EUR (Lei 36/2024 and the AT's official table); 2026 is 900 EUR (DL 97/2026).
- Clean-environment result: 28/28 browser/frontend checks (zero skipped), 124 backend tests plus the
  HTTP-contract check, four strict PDF-reader tests, and the existing IRS calculation fixture pass.
- Authorized real accounts were not opened in this pass because no remaining test required their
  values. The opt-in schema diagnostic now captures only stable endpoint IDs, field names and types,
  so future format coverage does not require publishing account data.
- No push, deployment, DNS/indexing action, store upload, resubmission or appeal was performed.

## Safety and release boundary

- The pre-change state of `efatura-helper`, `fiscal-monitor` and `cae-db` is preserved in verified
  Git bundles, binary patches, untracked-file archives and baseline refs named
  `backup/fiscalidade-pre-hardening-20260822T123029Z`.
- Existing dirty checkouts are not used for implementation. Each repository has an isolated
  worktree and a dedicated hardening branch.
- Work is committed in small reviewable checkpoints. No push, deployment, DNS change, Search
  Console action, Chrome Web Store upload, resubmission or appeal belongs to this phase.
- No real account is needed for the initial test suite. Any later authenticated verification must
  be read-only unless a specific, reversible e-Fatura classification test has been agreed, and its
  evidence must be redacted before it is saved.

## Internal-only product state

- Canonical origin: `https://fiscalida.de`.
- Branded API contract: `https://fiscalida.de/api/v1`.
- The preview remains behind the existing access control. It must emit `noindex, nofollow`, deny
  crawling in `robots.txt`, and publish no sitemap.
- Bookmarklet installation is hidden. The shared analyser runtime remains in the repository for
  parity and internal tests; there is no remote kill switch.
- The retired placeholder origin and the direct backend origin are not valid runtime dependencies.

## Privacy boundary

- The extension performs no Portal das Finanças or Segurança Social read before explicit local
  analysis consent, and makes no remote request before that point.
- Fonts, configuration, offers and runtime code are packaged with the extension. Remote code is
  forbidden.
- Consent is separate for local analysis, legal-entity merchant feedback, response-schema
  diagnostics, anonymous impact aggregates and household sharing.
- User-NIF-derived identifiers and distinct-user counters are removed. Contributions never accept
  raw fiscal records. Merchant feedback is accepted only for conservative legal-entity NIF ranges;
  natural-person, sole-trader and ambiguous identifiers are rejected.
- Extension profile data uses extension-owned storage and an extension-owned profile page. The
  extension does not hand fiscal summaries through a public URL fragment.

## Correctness boundary

- Every account endpoint must detect expired/login HTML or failure envelopes and report them on
  screen. Pagination must be complete or fail visibly; partial results cannot look complete.
- Calculations are versioned by income year and carry provenance. Constants repeated in code,
  public explanations and snapshots are tested for agreement.
- The rental-regime recommendation stays disabled until a complete, year-specific model has
  independent fixtures. A registered CAE is a hint that a classification is available, not proof
  that a specific purchase belongs in it.
- PDF-derived values are accepted only after encryption, stream, font and ToUnicode handling has
  succeeded. A parse failure is unknown, never zero.
- Household inputs and aggregates are schema-validated, bounded, retained for at most 400 days and
  deletable per member.

## API boundary

- `/api/v1` exposes only bucketed merchant-map reads, the reviewable CAE rule table,
  privacy-preserving contributions, household aggregates and public aggregate statistics. The
  retired `/consulta` company-lookup surface is not part of the contract.
- Request bodies are bounded and schema-validated. Access logs redact identifiers and room keys;
  application code does not log request bodies.
- Contributions aggregate immediately where individual records are unnecessary. Shape collection
  stores field names and type tokens only under stable endpoint identifiers, never raw URLs or
  values.
- Development and tests use loopback mocks. Cloud access credentials are never placed in client
  code, fixtures, logs or commits.

## Mandatory verification

- Browser privacy tests are required and cannot be reported as green when skipped.
- A pre-consent canary fails on any account read, storage read of account-origin data, remote font,
  offer, analytics or API request.
- Contract tests cover request size, unknown fields, PII-shaped keys and values, legal-entity NIF
  policy, stable endpoint identifiers, household retention/deletion and aggregate-only impact data.
- Synthetic fixtures cover every reader state, pagination boundary, tax-year pack and PDF parser
  failure mode. Private captured data is never committed.

## Deferred public work

Public DNS/cutover, sitemap/indexing, bookmarklet re-evaluation, Chrome Web Store upload or appeal,
and public API availability remain explicitly out of scope until the internal checklist is green.
