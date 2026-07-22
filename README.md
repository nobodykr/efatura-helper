# Fatura Boa

A small, open tool that helps you classify your **pending faturas** on Portugal's
[e-Fatura](https://faturas.portaldasfinancas.gov.pt) so you stop leaving IRS deductions on the table.

**It never asks for your password.** Read this whole file - the security model is the point.

## What it does

On the e-Fatura page, it:
1. Reads your **pending** invoices (`estadoBeneficio = "P"`).
2. Suggests a sector for each, learned from **your own already-classified invoices** (a merchant you
   sorted once is remembered - no external lookups, no guessing).
3. Shows you a table. You review, correct anything, tick the ones you approve, and click **Aplicar**.
4. Submits only what you approved, using the standard e-Fatura endpoint.

## Why it is safe (and why you should distrust anything that asks for your Finanças password)

- **It runs inside your own browser**, on the e-Fatura page where you are **already logged in**. It
  reuses that session. There is no login screen of ours.
- **There is no password field.** The tool never receives, transmits, or stores your credentials -
  they are never involved at any point.
- **Your invoices never leave your browser.** They are not sent to us, stored, or proxied. The tool
  reads slices of the public merchant map, keyed by the **last 3 digits** of each merchant's NIF, and
  sends nothing of yours to fetch them. A slice holds ~300 companies, so the server learns you have
  *some* merchant in that group and never which - which is the whole reason it does not simply ask
  "what sector is this NIF?".
- **Household sharing is opt-in and off by default.** IRS ceilings are per *agregado familiar*, but
  this page can only ever see **one** account - on real data, one account showed 3.186 EUR of
  despesas gerais where the household had 10.389 EUR, so a solo view can report a ceiling as having
  room when it is 14x over. If you opt in, **six numbers** are shared (how much of each ceiling is
  used) plus a random per-browser member id - never invoices, merchants, dates or purchase amounts,
  and never your NIF or email, which are not read for this feature at all. The room key is **256
  random bits generated in your browser**; leave the box empty to create a household, or paste a
  key to join one. **The key is the secret** - anyone holding it can read and change that room, so
  share it only with your household, like a password.
- **The source is fully public and auditable.** [`tool.js`](tool.js) is the entire logic - 1053
  lines, comments included, and the comments are most of it. Read it, or ask someone technical to.
  What you see is what runs: the file served at `faturas.diogoandrade.com/tool.js` is byte-identical
  to the one in this repo.
- **The rules it applies are public too.** The CAE -> deduction-sector table, the CIRS article behind
  each mapping (78.º-C saúde, 78.º-D educação, 78.º-E imóveis, 78.º-F, 84.º lares), the ambiguous
  cases with the decision taken on each, and the ranking used to order the cascade are served live at
  [`cae-db.diogoandrade.com/cae-map.json`](https://cae-db.diogoandrade.com/cae-map.json). Served
  rather than committed here on purpose: one canonical file, so it can never document rules the tool
  is not actually applying.
  The cae-db *source* is private. How merchant data is fetched from the state registry is an
  implementation detail, and publishing the scraping mechanics mainly invites people to hammer SICAE.
  What affects your tax is public; what fetches the data is not.
- **You approve every classification.** Nothing is submitted without you ticking it. Suggestions are
  only suggestions.

> NOTA: Never enter your Finanças NIF + password on any site that is not `portaldasfinancas.gov.pt`.
> A site that asks for it is a phishing site - no matter how helpful it claims to be. This tool never asks.

## Install

Open [the page](https://efatura-helper.pages.dev) and drag the **Fatura Boa** button to your
bookmarks bar. Then open e-Fatura, log in, and click the bookmark.

The bookmark loads [`tool.js`](tool.js) from this repo's site into the e-Fatura page. If you prefer
zero remote loading, copy the contents of `tool.js` and run it in the browser console yourself - same result.

## Audit it yourself

Search `tool.js` for `fetch(`. There are **nine**, and they go to exactly two hosts:

| Where | What | When |
|---|---|---|
| `faturas.portaldasfinancas.gov.pt` (relative, same-origin, your session) | read your faturas; the write path for classifications | reading: after you accept the gate. Writing: **never in this version** - `DRAFT = true`, no submit button is rendered |
| `cae-db.diogoandrade.com` | `GET /bucket/<last 3 digits of NIF>` - one request per bucket your merchants fall into | after you accept the gate. **Sends nothing of yours**; a bucket holds ~300 companies, so the server learns you have *some* merchant in that group of 300 and never which one. Matching happens locally. It sees your IP, as any server does |
| `cae-db.diogoandrade.com` | `POST /outcome` and `POST /refresh/{nif}` - a **merchant's** NIF plus the sector, to correct the shared map | only if you tick "improve suggestions" (**off by default**) |
| `cae-db.diogoandrade.com` | `PUT`/`GET /household/{key}` - six numbers | only if you press **Ligar** |
| `cae-db.diogoandrade.com` | `POST /win` - four numbers (year, waste, gain, count) | only if you press **Enviar anónimo** |

Those are **three separate opt-ins**, not one switch: the share tickbox, joining a household, and
the anonymous-win button are independent. Touch none of them and the only request that leaves your
browser is the set of `/bucket/<3 digits>` downloads.

`index.html` - the landing page. **It is not tracker-free:** it loads Google Fonts
(`fonts.googleapis.com`, `fonts.gstatic.com`) and Cloudflare Turnstile
(`challenges.cloudflare.com`, for the feedback form's spam check). Both see your IP and User-Agent
when you open the page. Neither is loaded by `tool.js`, so neither is present on the e-Fatura page
where the tool actually runs.

## Disclaimer

Community tool, **not affiliated with the Autoridade Tributária**. Provided as-is, no warranty.
A sector classification is **your declaration to AT** - classify each invoice under the sector where the
purchase actually happened. Always verify in e-Fatura afterwards.

## License

**PolyForm Noncommercial 1.0.0** - see [LICENSE](LICENSE).

Free for personal, charitable, research, educational and government use. **Commercial use is not
permitted** - you may not sell it, host it as a paid service, or use it for commercial advantage.
Note this is deliberately *not* an OSI open-source licence: the source stays fully public and
auditable (that is the security model), but monetising it is off the table.
