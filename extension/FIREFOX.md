# Firefox port - plan (NOT built yet)

Chrome is live first. Firefox is a small, cheap follow-up when we want it. Notes so it is a
mechanical job later, not a rediscovery.

## What changes vs the Chrome build
- **Manifest**: Firefox supports MV3 but needs `browser_specific_settings.gecko.id` (an
  extension id, e.g. "fatura-boa@diogoandrade.com") and a `strict_min_version`. The MV3
  background differs: Firefox uses `background.scripts` (or `background.service_worker` on
  recent versions) - ship a background that works on both, or branch the manifest.
- **APIs used** (bar.js / background.js): `chrome.runtime`, `chrome.scripting.executeScript`,
  `chrome.storage.local`, `chrome.storage.session` and `chrome.alarms`. Firefox aliases these under `browser.*` but also polyfills `chrome.*`,
  so the current code likely runs unchanged. VERIFY `chrome.scripting` is available on the target
  Firefox (it is, from FF109+). No `chrome.*` promise/callback surprises in what we use.
- **host_permissions** `https://*.portaldasfinancas.gov.pt/*` - same, Firefox honours it.
- **Content script** injection model is the same.

## Build + distribute
- AMO (addons.mozilla.org) publishing is FREE (no dev fee, unlike Chrome's one-time $5).
- Add a build target: either `extension-firefox/` with its own manifest, or a
  `TARGET=firefox node extension/build.mjs` flag that swaps the manifest bits and zips.
- AMO requires signing; `web-ext sign` (Mozilla CLI) does it with an AMO API key. There is also
  an AMO upload API (like the Chrome cws.py we built) if we want it scripted.
- Reuse the same tool.js bundle + the 1280x800 store screenshots (dist/store/).

## Site
- extensao.html already has a muted "Firefox brevemente" line. When live, turn it into a second
  CTA ("Adicionar ao Firefox" -> the AMO listing) next to the Chrome one, and update the compare
  box ("por agora so Chrome" -> "Chrome e Firefox").

## Effort estimate
Half a day: manifest tweak + web-ext build/sign + AMO listing (reuse the STORE-LISTING.md copy)
+ the small extensao.html CTA edit. No tool.js/bar.js logic changes expected.
