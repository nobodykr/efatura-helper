# Deploying

This is a static site: `index.html` + `tool.js`. Host it anywhere that serves files.

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

Open e-Fatura, log in, open the browser console (F12), paste the entire contents of `tool.js`,
press enter. Identical behaviour to the bookmarklet, nothing published. Always do this first -
real invoice data exercises paths nothing else will.

## Related service

The bookmarklet reads its merchant map from a **cae-db** instance. Point `CAEMAP_URL` in
`tool.js` at your own, or use the public one at `https://cae-db.diogoandrade.com`.

The cae-db source is **private**, deliberately. The split is: *how your tax is calculated* is
public and auditable (`tool.js` here, plus the CAE -> sector map it relies on); *how the merchant
data is fetched* is not. The registry-scraping mechanics are an implementation detail and
publishing them mostly just invites people to hammer SICAE.

The map API stays open where it has to be: `/sectors.json`, `/map.json`, `/cae-map.json` and
`/stats` answer to anyone. Serving the whole map is what lets the bookmarklet work without ever
telling the server which merchants you shop at.

`/nif/{nif}` and `/search` are PUBLIC reads since 2026-07-22 (opened for the NIF searcher;
/search is deliberately restricted to trading businesses - see the docstring in cae-db server.py,
that restriction is load-bearing). The map-MUTATING routes remain token-gated. An earlier version
of this note said both reads were 401-gated; that was true on 2026-07-21 and superseded a day
later - verified live 2026-07-28.

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
5. Deploy (`npx wrangler pages deploy . --project-name=efatura-helper --branch=main`, from a clean tree -
   node_modules is not deployable). Verify at /verificar (served tool.js must hash to the published
   integrity) and that versions.json `repo` is nobodykr, not a fork.

The commit hash in versions.json is the public commitment: content-addressed, so it can't be moved or
point at different code the way a tag can. A `git tag vYYYY.MM.DD` is still fine as a human-readable
marker, but it is no longer the provenance anchor.
