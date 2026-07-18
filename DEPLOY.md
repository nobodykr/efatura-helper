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

The bookmarklet reads its merchant map from a **cae-db** instance
(`https://github.com/nobodykr/cae-db`). Self-host your own with `docker compose up -d` and point
`CAEMAP_URL` in `tool.js` at it, or use the public one.
