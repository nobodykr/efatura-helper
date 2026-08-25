# Fiscalidade / Fatura Boa

Fiscalidade is a browser tool for reviewing Portuguese tax information in the user's existing
official-site sessions. Fatura Boa is its e-Fatura classifier and Chrome extension.

The site remains gated and no Chrome Web Store version is public. Sitemap and public search
indexing remain disabled. Stable Store submission is a separate legal/review step; local testing
uses a separately named DEV extension and a generated DEV bookmarklet. The bookmarklet restores
the small July loader and pins today's `profile-contract.js` and `tool.js` with SRI; the asset-only
`faturas.diogoandrade.com` host serves those two files and returns 404 for every other path.
The bookmarklet installer exists only at the gated internal `/favorito-dev` route; there is no
public bookmarklet surface.

## Security and privacy boundary

- The tool has no Fiscalidade account or login and never asks for an AT or Segurança Social
  password. Authentication remains entirely on the official sites.
- Invoice rows, tax records, names and the user's NIF are processed in the browser. The complete
  profile is not accepted by Fiscalidade's contribution endpoints.
- Before the extension's explicit authorization action, it does not read the official page, use
  the page's storage, inject `tool.js`, or issue a network request.
- The e-Fatura bar exposes a separate `Painel de faturas` action. Individual invoice rows are
  validated by the service worker, kept only in trusted-context `chrome.storage.session`, and
  actively deleted by an end-of-day alarm; the review page renders them without HTML injection.
- Canonical `/perfil` stores the complete profile in Fiscalidade origin storage until the end of
  the local day. The extension and DEV bookmarklet send it there only with a nonce-bound browser
  `postMessage`; fiscal values do not enter URL fragments or extension profile storage.
- The free profile flow requires an explicit `market-v1` agreement. A source counts as complete
  only after the isolated service accepts its allowlisted value-free schema and, for e-Fatura,
  company/year aggregates for checksum-valid legal entities. The payload never contains buyer
  identity, purchase dates, document identifiers, issuer names or individual invoice rows.
- The market sink rejects unknown fields, re-HMACs browser-scoped dedupe tokens, expires raw rows
  after 400 days and releases no company/year aggregate below 20 contributors. It uses a service,
  database, origin and credentials separate from cae-db.

The direct policy intended for future store review is
[`privacidade.html`](privacidade.html), with canonical URL `https://fiscalida.de/privacidade`.

## Internal architecture

- [`tool.js`](tool.js): browser-side readers, classification logic and UI.
- [`profile-contract.js`](profile-contract.js): one 13-source and browser-handoff contract.
- [`extension/`](extension): Manifest V3 wrapper, guided profile action, local invoice-review
  dashboard, local utilities and deterministic build.
- [`functions/api/v1/[[path]].js`](functions/api/v1/[[path]].js): constrained same-origin API facade.
- [`market/`](market): isolated, strict write-only market intake service and storage tests.
- [`year_snapshots.json`](year_snapshots.json): per-income-year statutory rule snapshots.
- [`DEDUCOES.md`](DEDUCOES.md): reviewable description of the active deduction model.
- [`docs/INTERNAL-HARDENING-PLAN.md`](docs/INTERNAL-HARDENING-PLAN.md): implementation and release
  boundary for this audit.

The public company map remains a read-only dependency in the sibling `cae-db` repository. The new
market intake does not import or write cae-db. The strict offline PDF reader used for internal
validation lives in the sibling `fiscal-monitor` repository.

## Verification

Run the full suite with a real Chromium executable available:

```bash
npm install
CHROME_PATH=/path/to/chromium npm test
```

`npm test` fails if the browser privacy check cannot run. For a deliberately incomplete local
unit-only pass, use `npm run test:unit`; its output is labelled incomplete.

The suite checks, among other contracts:

- zero pre-consent network activity and zero pre-consent official-page reads;
- exact extension host permissions, local executable assets and canonical browser-only handoff;
- top-frame/same-extension message validation, e-Fatura-only invoice snapshots and active
  end-of-day deletion of the temporary review snapshot;
- complete paginated/date-split e-Fatura reads and explicit failure on an unsplittable cap;
- treatment of attributed (`R`, `B`, `E`) versus pending (`P`) document states;
- synchronization of public HTML, Markdown, calculation constants and legal snapshots;
- stable schema endpoint IDs shared by both browser paths and the isolated intake validator;
- fixed-origin API forwarding, request-size limits and header minimization;
- absence of retired `/consulta`, `/contrato`, sitemap and bookmarklets outside the gated internal
  installer.

## Release boundary

Every production update follows [`DEPLOY.md`](DEPLOY.md). Nothing in the DEV build deploys the site,
ungates it, modifies the Chrome Web Store draft or touches the cae-db production service.

## License

PolyForm Noncommercial 1.0.0; see [`LICENSE`](LICENSE).
