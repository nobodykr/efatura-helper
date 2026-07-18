# e-Fatura Helper

A small, open tool that helps you classify your **pending faturas** on Portugal's
[e-Fatura](https://faturas.portaldasfinancas.gov.pt) so you stop leaving IRS deductions on the table.

**It never asks for your password.** Read this whole file — the security model is the point.

## What it does

On the e-Fatura page, it:
1. Reads your **pending** invoices (`estadoBeneficio = "P"`).
2. Suggests a sector for each, learned from **your own already-classified invoices** (a merchant you
   sorted once is remembered — no external lookups, no guessing).
3. Shows you a table. You review, correct anything, tick the ones you approve, and click **Aplicar**.
4. Submits only what you approved, using the standard e-Fatura endpoint.

## Why it is safe (and why you should distrust anything that asks for your Finanças password)

- **It runs inside your own browser**, on the e-Fatura page where you are **already logged in**. It
  reuses that session. There is no login screen of ours.
- **There is no password field.** The tool never receives, transmits, or stores your credentials —
  they are never involved at any point.
- **There is no server.** Your invoices and fiscal data never leave `portaldasfinancas.gov.pt`.
  Nothing is sent to us or to anyone. There is nothing to breach.
- **It is fully open source.** [`tool.js`](tool.js) is the entire logic — ~150 readable lines. Read it,
  or ask someone technical to. What you see is what runs.
- **You approve every classification.** Nothing is submitted without you ticking it. Suggestions are
  only suggestions.

> ⚠️ Never enter your Finanças NIF + password on any site that is not `portaldasfinancas.gov.pt`.
> A site that asks for it is a phishing site — no matter how helpful it claims to be. This tool never asks.

## Install

Open [the page](https://efatura-helper.pages.dev) and drag the **e-Fatura Helper** button to your
bookmarks bar. Then open e-Fatura, log in, and click the bookmark.

The bookmark loads [`tool.js`](tool.js) from this repo's site into the e-Fatura page. If you prefer
zero remote loading, copy the contents of `tool.js` and run it in the browser console yourself — same result.

## Audit it yourself

- `tool.js` — the whole tool. Search it for `fetch(` — every network call goes to
  `faturas.portaldasfinancas.gov.pt` (relative URLs, same-origin). There is **no** call to any other host.
- `index.html` — the landing page. Static. No trackers.

## Disclaimer

Community tool, **not affiliated with the Autoridade Tributária**. Provided as-is, no warranty.
A sector classification is **your declaration to AT** — classify each invoice under the sector where the
purchase actually happened. Always verify in e-Fatura afterwards.

## License

MIT — see [LICENSE](LICENSE).
