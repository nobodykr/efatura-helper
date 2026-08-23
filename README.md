# Fiscalidade / Fatura Boa

Fiscalidade is a browser tool for reviewing Portuguese tax information in the user's existing
official-site sessions. Fatura Boa is its e-Fatura classifier and Chrome extension.

The Chrome extension is on the controlled production channel. Bookmarklet installation, sitemap
and public search indexing remain disabled; the extension is distributed only through its reviewed
Chrome Web Store item.

## Security and privacy boundary

- The tool has no Fiscalidade account or login and never asks for an AT or Segurança Social
  password. Authentication remains entirely on the official sites.
- Invoice rows, tax records, names and the user's NIF are processed in the browser and are not
  accepted by Fiscalidade's contribution endpoints.
- Before the extension's explicit authorization action, it does not read the official page, use
  the page's storage, inject `tool.js`, or issue a network request.
- The extension profile is stored in `chrome.storage.local` and expires at the end of the local
  day. The web-only profile uses Fiscalidade's origin storage with the same expiry.
- Optional contributions are independent and off by default: legal-entity merchant corrections,
  response-schema shapes containing field names/types only, aggregate impact totals, and household
  ceiling totals under a random shared room key.
- Contribution APIs reject unknown fields and require `consent: true`. The first-party facade
  forwards only an explicit path/method allowlist to a fixed HTTPS upstream.

The direct policy intended for future store review is
[`privacidade.html`](privacidade.html), with canonical URL `https://fiscalida.de/privacidade`.

## Internal architecture

- [`tool.js`](tool.js): browser-side readers, classification logic and UI.
- [`extension/`](extension): Manifest V3 wrapper, consent bar, extension-owned profile and build.
- [`functions/api/v1/[[path]].js`](functions/api/v1/[[path]].js): constrained same-origin API facade.
- [`year_snapshots.json`](year_snapshots.json): per-income-year statutory rule snapshots.
- [`DEDUCOES.md`](DEDUCOES.md): reviewable description of the active deduction model.
- [`docs/INTERNAL-HARDENING-PLAN.md`](docs/INTERNAL-HARDENING-PLAN.md): implementation and release
  boundary for this audit.

The API implementation and public company map live in the sibling `cae-db` repository. The strict,
offline PDF reader used for internal validation lives in the sibling `fiscal-monitor` repository.

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
- exact extension host permissions, local executable assets and extension-owned storage;
- complete paginated/date-split e-Fatura reads and explicit failure on an unsplittable cap;
- treatment of attributed (`R`, `B`, `E`) versus pending (`P`) document states;
- synchronization of public HTML, Markdown, calculation constants and legal snapshots;
- stable schema endpoint IDs shared by both browser paths and the API allowlist;
- fixed-origin API forwarding, request-size limits and header minimization;
- absence of retired `/consulta`, `/contrato`, sitemap and active bookmarklet surfaces.

## Release boundary

Every production update follows [`DEPLOY.md`](DEPLOY.md): commit the exact analyzer bytes, regenerate
the public provenance manifests, verify the direct privacy-policy URL anonymously, run the complete
browser suite and submit only the deterministic package produced by `extension/build.mjs`.

## License

PolyForm Noncommercial 1.0.0; see [`LICENSE`](LICENSE).
