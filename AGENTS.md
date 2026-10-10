# efatura-helper

Level: 1 (customers depend on it). How level 1 ships: /mnt/data/apps/AGENTS.md.
fiscalida.de is not live yet; the site and any public bookmarklet stay gated.

## What it is
Fiscalidade / Fatura Boa: a browser tool and Chrome extension for reviewing Portuguese tax information
in the user's own official-site sessions, plus the isolated market service (`market/`) that receives
minimized contributions. Static site on Cloudflare Pages (`index.html`, `tool.js`, `perfil.html`).
`tool.js` must stay pure ASCII. Read README.md for the privacy boundary and DEPLOY.md for the runbook.

## Test
`npm test` (node run-tests.mjs; needs a browser, a missing one fails the run). A fresh worktree has
no `node_modules`: run `npm ci` first, or about 30 checks fail on `Cannot find module 'jsdom'`.
Market service: `python3 -m unittest market.test_storage`.
e-Fatura requests are paced 8 s apart with 429 retries after 15 s and 30 s (tool.js `efaturaGet`), so a
test that reads e-Fatura more than once sets `__FISCALIDADE_CONFIG__.efaturaTimeScale` (for example 0.001)
before loading tool.js; the bookmarklet and the extension never set it.

## Runs
Containers `fiscalidade-market` and `fiscalidade-market-tunnel`, compose in `market/docker-compose.yml`.

## Merge
A PR that changes `tool.js` merges with a merge commit, never a squash: `versions.json`
`source_commit` is the branch commit that last changed `tool.js` and it must land on main as is.

## Deploy
Level 1 procedure. Never compose in `market/` (the hook blocks it; security restarts go through
`agent-prod-recreate`). The static site is deployed by hand with wrangler per DEPLOY.md.
