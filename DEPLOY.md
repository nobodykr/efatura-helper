# Deploying

## The one thing to know first

**Pushing to GitHub does NOT publish the site.** There is no auto-deploy hook. The only CI on
this repo is `encoding-guard.yml`, which checks `tool.js` is pure ASCII and nothing else.

Publishing is a **separate manual `wrangler` step**. If you push and then wonder why
faturas.diogoandrade.com still serves the old bookmarklet, this is why.

## Publish

```bash
cd /mnt/data/apps/efatura-helper

# token lives in the fixed secrets store - consume by path, never echo it
set -a; . /mnt/data/secrets/cloudflare.env; set +a
export CLOUDFLARE_ACCOUNT_ID=1e3a78b400b331de418641f0f98c6cc8

npx --yes wrangler@latest pages deploy . \
  --project-name=efatura-helper \
  --commit-dirty=true
```

Cloudflare Pages project: **`efatura-helper`** (account `1e3a78b4...`, also recorded in
`.wrangler/cache/pages.json`). It serves the custom domain **faturas.diogoandrade.com**.

Deploy uploads the whole directory. `tool.js`, `index.html`, `cae-map.json` and `_headers` are the
files that matter; the rest is inert.

## Two ways this bites you (both happened, 2026-07-18)

**1. Deploy from an ABSOLUTE path, never a bare `.`**

```bash
npx --yes wrangler@latest pages deploy /mnt/data/apps/efatura-helper \
  --project-name=efatura-helper --commit-dirty=true
```

A `cd` in a chained command does not always carry, and `deploy .` will happily publish whatever
directory you are actually standing in. Doing this from `cae-db` published `data/tokens.txt` - a
live worker token - to the public site. The token had to be rotated. `.gitignore` does NOT protect
you here: wrangler uploads the directory, not the git tree.

**2. Verify by CONTENT, not by status code**

Cloudflare Pages serves **HTTP 200 with the index.html fallback** for unknown paths. So
`curl -o /dev/null -w '%{http_code}'` returns 200 for files that do not exist, and a leak check
built on status codes reports everything as exposed. Chasing that phantom cost three redeploys and
a wrangler cache wipe. Check what actually comes back:

```bash
curl -s "https://faturas.diogoandrade.com/data/tokens.txt?cb=$RANDOM" | head -c 20
# "<!doctype html>" = fallback, file is NOT there
```

Also note Pages sets `s-maxage=604800`, so a file exposed even briefly stays in the edge cache for
**7 days**. Purging needs a token with the Cache Purge permission - the deploy token does not have
it.

## Verify it actually shipped

Do not trust the "Deployment complete" line - it reports the `*.pages.dev` preview URL, which can
be live while the custom domain is still serving cache. Check the real host:

```bash
curl -s https://faturas.diogoandrade.com/tool.js | grep -c "sectors.json"   # expect >0
```

Or block until it lands:

```bash
until curl -s https://faturas.diogoandrade.com/tool.js | grep -q "sectors.json"; do sleep 8; done
```

Swap `sectors.json` for whatever string is new in the version you just shipped.

## Before you deploy tool.js

`tool.js` must be **pure ASCII**. The e-Fatura page is served as Latin-1, so a raw `ç` or `€` in the
file renders as mojibake there. Portuguese text goes in as `\uXXXX` escapes.

```bash
node escape-tool.js     # rewrites any non-ASCII char as \uXXXX
node --check tool.js    # syntax
```

CI fails the push otherwise, but CI does not block the deploy - wrangler will happily publish a
broken file. Run both locally.

## Testing without publishing

Open e-Fatura, log in, open the browser console (F12), paste the entire contents of `tool.js`,
press enter. Identical behaviour to the bookmarklet, nothing published. Always worth doing before
a deploy, since real invoice data exercises paths that nothing here can.

## Related services

The bookmarklet reads its merchant map from **cae-db** (`/mnt/data/apps/cae-db`, container
`cae-db`, public at cae-db.diogoandrade.com). That deploys differently - it is a Docker service:

```bash
cd /mnt/data/apps/cae-db
docker compose build cae-db && docker compose up -d --force-recreate cae-db
```

Note `server.py` is **baked into the image**, so editing it on disk does nothing until you rebuild.
The CAE table (`data/cae_sectors.json`) and `data/tokens.txt` are on the mounted volume, so those
can be edited and picked up with a plain restart.
