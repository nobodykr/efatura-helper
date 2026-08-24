# Release runbook

The Chrome extension uses the controlled `production` channel. Search indexing, sitemap and any
public bookmarklet remain disabled. The self-contained DEV bookmarklet is available only on the
gated internal `/favorito-dev` route; extension releases still require the checks below.

This is a static site: `index.html` + `tool.js`. Host it anywhere that serves files.

**Runtime dependencies:** read-only merchant-map routes use the existing configured API. The new
`POST /api/v1/intake` route must use `FISCALIDADE_MARKET_ORIGIN` and its own optional Access
credentials; it deliberately never falls back to `FISCALIDADE_API_ORIGIN` or cae-db. It is disabled
and optional for local profile completion until the isolated service and cleanup are verified.

## Before you deploy tool.js

`tool.js` must be **pure ASCII**. The e-Fatura page is served as Latin-1, so a raw accented
character renders as mojibake there. Portuguese text goes in as `\uXXXX` escapes.

```bash
node escape-tool.js     # rewrites any non-ASCII char as \uXXXX
node --check tool.js    # syntax
```

CI enforces the ASCII rule on push.

**A passing `node --check` is not verification.** It cannot catch a called-but-undefined function -
that ships fine and then throws at runtime for every user. Check the symbols exist too.

## Testing without publishing

Run `npm run build:dev`. It produces a separately named unpacked extension/ZIP and a self-contained
DEV bookmarklet installer under `dist/dev`, and the identical ignored runtime page
`favorito-dev.html` for the gated site. Neither artifact changes the Web Store draft. The favorite
also works directly on a supported official page and retries the gated `/perfil` handshake.

## Related service

The extension reads bucketed merchant-map data through `https://fiscalida.de/api/v1`. The upstream
origin belongs only in deployment configuration, never in browser code.

The cae-db source is **private**, deliberately. The split is: *how your tax is calculated* is
public and auditable (`tool.js` here, plus the CAE -> sector map it relies on); *how the merchant
data is fetched* is not. The registry-scraping mechanics are an implementation detail and
publishing them mostly just invites people to hammer SICAE.

The browser receives only the last-three-digit map buckets needed for the current analysis. A
failed bucket aborts the recommendation instead of silently turning every missing merchant into
general expenses.

The write-only market intake is implemented in `market/` with a dedicated SQLite file and pepper.
It must be deployed separately, with access logs disabled and no cae-db volume or credential.

## Provably-fair releases
Provenance is a `source_commit` (the immutable Git commit that last changed tool.js), NOT a release tag.
So the order matters - commit tool.js BEFORE generating the manifest:
1. Bump `FB_VERSION` in tool.js if the code changed, and `node escape-tool.js` (keep pure ASCII).
2. COMMIT tool.js. `make-versions.mjs` refuses to publish a manifest while tool.js is dirty vs HEAD, so
   the hash always corresponds to a committed file.
3. `node make-versions.mjs` - regenerates versions.json: the published sha384 + `source_commit` (resolved
   from `git log -1 -- tool.js`) + the `source` blob URL on nobodykr. `node make-audit.mjs` - regenerates
   audit-manifest.json for /auditoria (fails loud via test-audit-sync.js if it drifts).
4. Commit versions.json + audit-manifest.json, then `git push` to nobodykr - the push is what makes
   `source_commit` resolve on GitHub (no separate `git push --tags` step to forget).
5. Deploy from a FILTERED copy. Two reasons to filter: `extension/`+`dist/` must never reach the
   public site, AND the docs / tests / build scripts must not be publicly served (they leak the
   architecture - the cae-db split, endpoint shapes, this very deploy command). Only runtime files
   go up: tool.js, *.html, all data *.json, metrics.js, fonts, functions/, _headers, _routes.json,
   robots/icons. Exact command:
   ```
   rsync -a --delete --delete-excluded \
    --exclude extension --exclude dist --exclude market --exclude node_modules --exclude .git \
     --exclude .wrangler --exclude .github --exclude .claude \
     --exclude .gitignore --exclude .gitleaks.toml \
     --exclude '*.md' --exclude docs --exclude outreach --exclude LICENSE \
     --exclude 'test-*.js' --exclude 'make-*.mjs' --exclude 'build-*.mjs' \
     --exclude run-tests.mjs --exclude check-functions.js --exclude escape-tool.js \
     --exclude package.json --exclude package-lock.json \
     . /tmp/fb-deploy/
   npx wrangler@4.125.0 pages deploy /tmp/fb-deploy --project-name=efatura-helper --branch=main
   ```
   NEVER drop a runtime data file from this list by adding a broad `*.json` exclude - versions.json,
   audit-manifest.json, audit-freshness.json, offers.json, cae_sectors.json, legal_sources.json,
   cirs_atividades.json and year_snapshots.json are all fetched live. Verify at /verificar (served
   tool.js must hash to the published integrity) and that versions.json `repo` is nobodykr, not a fork.

The commit hash in versions.json is the public commitment: content-addressed, so it can't be moved or
point at different code the way a tag can. A `git tag vYYYY.MM.DD` is still fine as a human-readable
marker, but it is no longer the provenance anchor.

Before any public release, complete legal review of the mandatory market exchange, verify the
privacy page can meet Store requirements without ungating unrelated product pages, run the full
browser suite with zero skips, and submit a newly reviewed stable ZIP. A DEV ZIP is never uploaded.
