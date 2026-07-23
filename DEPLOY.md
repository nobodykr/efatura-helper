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

`/nif/{nif}` and `/search` are token-gated (401 without `x-worker-token`), as are the
map-mutating routes. Verified 2026-07-21 - do not describe them as open.

## Provably-fair releases
Before every deploy: bump `FB_VERSION` in tool.js if the code changed, then `node make-versions.mjs` (regenerates versions.json, the published hash). Deploy. Verify at /verificar. Tag the release: `git tag vYYYY.MM.DD && git push --tags` - the tag is the public timestamped commitment.
