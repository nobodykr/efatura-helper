# Fiscalidade internal hardening plan

Status: the original hardening landed on 2026-08-22. The canonical-profile refactor below is
implemented locally on 2026-08-23 and is not deployed or submitted. Public release remains blocked.

This is the repository copy of the approved internal-only plan. It is deliberately versioned so
findings, decisions, tests and implementation commits do not exist only in chat history.

## Implementation result

- `/perfil` is now the only profile/results hub. A shared contract orders all 13 SSO partitions,
  exposes one next-source action, reuses one named official tab and returns a nonce-bound envelope
  with `postMessage`. The website launcher and 13 competing action buttons are removed.
- The extension bar has one functional action, “Ler e voltar à Fiscalidade”. The separately named
  DEV build and self-contained DEV bookmarklet use the same contract and reader bytes.
- Tax-status JSON errors distinguish expired sessions, HTTP errors, empty responses, invalid JSON
  and unknown debt schemas. Optional coima/agenda failures remain unknown and never render as zero.
- eFatura builds company/year market aggregates only for checksum-valid legal entities. The
  mandatory exchange excludes buyer identity and individual invoices and is stated before intake.
- `POST /api/v1/intake` is pinned to a separate origin and credentials. The isolated service has a
  strict schema, double-HMAC dedupe, 400-day retention and a 20-contributor publication threshold;
  it does not import, mount or write cae-db.
- Production, the gated site and the Chrome Web Store draft were not changed.

- `/consulta`, `/contrato`, the free-text feedback endpoint, sitemap and all active bookmarklet
  installation surfaces are removed. Every HTML page and response is noindexed for internal review.
- The extension is Manifest V3 with five exact official hosts and bundled runtime/data. Consent is
  stored in extension storage; complete profile state lives on canonical `/perfil` until end of day.
- The first-party API facade has a fixed HTTPS upstream, explicit route/method allowlist, 64 KiB body
  cap, minimized headers and bounded query handling. Contributions are separate and off by default.
- e-Fatura reads split capped ranges until complete or fail visibly. Attributed states `R`, `B` and
  `E` consume ceilings; `P` is pending. Unsupported rental recommendations and unvalidated PDF
  monetary parsing fail closed.
- Statutory values are synchronized across HTML, Markdown, code and snapshots. The 2025 rent limit
  is 700 EUR (Lei 36/2024 and the AT's official table); 2026 is 900 EUR (DL 97/2026).
- Clean-environment result: 33/33 browser/frontend checks (zero skipped), 124 backend tests plus the
  HTTP-contract check, four strict PDF-reader tests, and the existing IRS calculation fixture pass.
- Classifier version `2026.08.22.3` treats pending invoices and attributed corrections as one
  ceiling portfolio, values corrections net of deduction removed from the source, applies the 45%
  monoparental C99 rate consistently, and rebuilds from merged household totals without uploading
  those merged totals as one member's contribution. Four synthetic regression fixtures pin these
  cases.
- Historical automatic-classifier tools were reviewed as portal-behaviour evidence only. No
  historical script was imported or executed. Their later evidence proves that the raw attributed
  `alterarDocumentoAdquirente.action` route is rejected; Fiscalidade therefore keeps attributed
  corrections manual and never reports them as applied without post-state verification.
- Extension 0.5.4 was built twice from the reviewed source with the same explicit 12-file ZIP
  SHA-256: `95262e49aba31a6ac64665e21d34471bdb589e65874e99c719bf25c8aefb802f`.
- Two authorized AT personas were opened through `fiscal-monitor/profile_validate.mjs` after the
  synthetic suite passed. Raw responses stayed inside the browser; only endpoint contracts,
  booleans and value-free type schemas were emitted. Live evidence forced four same-host IRS apps
  into separate SSO steps, proved the signed activity screen needs top-level navigation, confirmed
  that one legitimate account may not expose that screen, and pinned the official deductions
  service to the last four completed income years. Segurança Social was cached-session-only:
  role flags and current payments passed, while contributory status remains unvalidated.
- No live invoice classification, push, deployment, DNS/indexing action, store upload, resubmission
  or appeal was performed.

## Safety and release boundary

- The pre-change state of `efatura-helper`, `fiscal-monitor` and `cae-db` is preserved in verified
  Git bundles, binary patches, untracked-file archives and baseline refs named
  `backup/fiscalidade-pre-hardening-20260822T123029Z`.
- Existing dirty checkouts are not used for implementation. Changes are prepared in an isolated
  clone and reviewed before they reach the canonical branch.
- Work is committed in small reviewable checkpoints. Only the reviewed internal hardening release
  may be pushed and deployed. Search Console actions, Chrome Web Store uploads, resubmissions and
  appeals remain outside this phase.
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
- Local page-read authorization remains explicit. The free profile separately requires a clearly
  described market-v1 agreement; optional classifier and household features retain their choices.
- User-NIF-derived identifiers and distinct-user counters are removed. Contributions never accept
  raw fiscal records. Merchant feedback is accepted only for conservative legal-entity NIF ranges;
  natural-person, sole-trader and ambiguous identifiers are rejected.
- Complete profile data uses Fiscalidade origin storage and end-of-day expiry. Packaged readers use
  a nonce-bound browser message, not a URL fragment or an extension-owned duplicate profile.

## Correctness boundary

- Every account endpoint must detect expired/login HTML or failure envelopes and report them on
  screen. Pagination must be complete or fail visibly; partial results cannot look complete.
- The profile has thirteen explicit sources because shared hostnames do not imply shared SSO
  sessions. Green receipts, IRS declarations, official deductions and Cat B expenses are separate;
  the activity declaration list and authoritative integrated cadastro are separate too.
- Activity declaration history never asserts the current state. Historical cessations, a later
  effective restart and a declared future start are distinct; only the date-aware integrated
  cadastro can trigger current open-activity obligations. Older activity-assistant tooling is used
  as portal-behavior evidence only and is not a runtime or test dependency.
- Calculations are versioned by income year and carry provenance. Constants repeated in code,
  public explanations and snapshots are tested for agreement.
- The rental-regime recommendation stays disabled until a complete, year-specific model has
  independent fixtures. A registered CAE is a hint that a classification is available, not proof
  that a specific purchase belongs in it.
- Pending suggestions reserve shared headroom globally. Optional correction value is calculated
  afterwards from the remaining ceiling space and subtracts any deduction lost from the source;
  separate paths cannot claim the same headroom twice.
- Household aggregation keeps account-only and merged values separate. The plan, correction value,
  summary and bars all rebuild from the same merged snapshot; repeat refreshes still upload only
  this account's contribution.
- PDF-derived values are accepted only after encryption, stream, font and ToUnicode handling has
  succeeded. A parse failure is unknown, never zero.
- Household inputs and aggregates are schema-validated, bounded, retained for at most 400 days and
  deletable per member.

## API boundary

- `/api/v1` exposes only bucketed merchant-map reads, the reviewable CAE rule table,
  privacy-preserving contributions, isolated market intake, household aggregates and public aggregate statistics. The
  retired `/consulta` company-lookup surface is not part of the contract.
- Request bodies are bounded and schema-validated. Access logs redact identifiers and room keys;
  application code does not log request bodies.
- Edge and backend rate limits use secret-keyed HMAC pseudonyms rather than raw or enumerable IP
  keys. Separate operation budgets preserve normal map, contribution and household workflows.
- The honeypot rejects unknown fields, omits query strings, referrers and city data, expires its
  private log after 7 days, and never blocks when bot evidence is missing or verified.
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

Public DNS/cutover, sitemap/indexing, public bookmarklet distribution, Chrome Web Store upload or
appeal, legal approval of market-v1 and public API availability remain explicitly out of scope.
