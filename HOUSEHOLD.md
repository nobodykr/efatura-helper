# Household sharing - design

Status: **BUILT AND LIVE** (client in `tool.js`, server in `cae-db/household.py`). This file said
"designed, not built" long after it shipped, which meant its two open caveats below - no write
authorisation, and unresolved retention - read as future problems when they were live ones. Kept
because the reasoning is worth preserving and the security argument should be checkable by someone
other than its author.

**One decision below was reversed on 2026-07-21.** The room key is no longer `KDF(nif + email)`.
It is now **256 bits from `crypto.getRandomValues`**. The derivation was wrong twice:

1. It leaked. PBKDF2 slows a guess but adds no entropy, and the salt was a fixed public constant.
   A NIF is 9 checksummed digits and an email is often public, so anyone who knew both could
   recompute the key and read, overwrite or `DELETE` that household - the server has no auth on
   those routes. Deriving from guessable inputs destroyed exactly the secrecy the out-of-band key
   exchange (below) was designed to provide.
2. It did not work. Each browser derived from its **own** `nifAdquirente`, so two people could
   never reach the same room. Everyone got a private single-member room while the UI told them to
   share a key nobody could enter - there was no paste-key field at all.

Now: empty box creates a room, pasting a key joins one. The key **is** the secret. Nothing about
you is read for this feature. Retention (400 days) and the missing write auth still stand as
written below.

## The problem it solves

IRS deduction ceilings are **per agregado familiar**, but each e-Fatura account only sees its own
invoices. Measured on real 2026 data:

| | despesas gerais |
|---|---|
| account A, registered | 8.031,77 EUR |
| account B, registered | 3.186,84 EUR |
| **household (AT's own figure)** | **10.389,19 EUR** |

So a tool looking at one account sees roughly a third of the household's consumption and reports a
ceiling as having room when it is 14x over. **Undercounting is the dangerous direction** - it makes
the tool confidently wrong in the direction that costs the user money.

The agregado data lives on `irs.portaldasfinancas.gov.pt`, a different origin from
`faturas.portaldasfinancas.gov.pt`, so the browser blocks the bookmarklet from reading it no matter
that the session cookie is domain-wide. This is a structural limit of a client-only tool, not a bug.

A server-side script with an `M3SV` session can read AT's real figure (see `fiscal-monitor/`), but
that is not available to someone with just a browser.

## Threat model (get this right before the crypto)

**A NIF is not a secret.** You give it at every till, it is on every invoice, companies' NIFs are
outright public. Treating it as confidential is theatre.

**What is sensitive is data BOUND to a NIF.** The harm is not "someone learned a 9-digit number", it
is "someone linked this person to their fiscal behaviour". So the design goal is not to hide NIFs -
it is to make sure nobody, including the server operator, can attach fiscal data to an identity.

## Why the obvious key is wrong, and the fix

**`hash(NIF)` fails.** Portuguese NIFs are 9 digits with a check digit: about 10^8 valid values.
Every possible hash can be precomputed in seconds. A salt does not help, because the server holds
the salt and can run the same enumeration itself. Anyone with the database reverses every row.

**`KDF(NIF + email)` holds.** Email has effectively unbounded entropy, so the space cannot be
enumerated. The residual attack is **targeted**: someone who already knows both your email and your
NIF can compute your room key and read your bucket. That is a real but narrow risk, and it is
mitigated, not eliminated, by a deliberately slow KDF.

Requirements that follow:

1. **Derive in the browser. Never transmit the inputs.** The server must receive only the derived
   key. A server that never has the option of learning something is a stronger guarantee than a
   server that promises not to store it.
2. **Slow KDF, not plain SHA-256.** PBKDF2 (high iteration count) or Argon2. This is what makes the
   targeted attack expensive rather than instantaneous.
3. **Aggregates only.** No invoices, no merchant names, no dates, no per-purchase amounts.

## The pairing flow

Both members have different NIFs and different emails, so they cannot independently derive the same
key. One is the host:

1. Host's browser derives `room = KDF(nif + email)` and **displays the resulting key**.
2. Host sends that opaque string to the partner by any means.
3. Partner pastes it in. She never needs the host's NIF or email - only the hash.

Sharing the derived key rather than the inputs is deliberate: the secret in transit is already
one-way. Lose the key and the room is simply unreachable; there is no recovery, which is correct.

## What crosses the wire

```json
{ "room": "<derived key>",
  "C05": 229.50, "C06": 0, "C07": 0, "C08": 0, "C99": 3636.22, "POT": 49.84 }
```

Six numbers and an opaque string. A full database breach leaks "some anonymous household has used
229 EUR of health deductions", which is close to worthless.

## Non-negotiables

- **Opt-in, default off.** The tool must work exactly as it does today for anyone who never touches
  this.
- **Self-hostable.** Same shape as `cae-db`: a small container anyone can run and point the tool at.
  A server people can replace is a very different proposition from one they must trust.
- **The security wording must change.** The page currently says *"Nao ha servidor... Nos nao
  recebemos nada."* Once a household bucket exists that is literally untrue. It becomes something
  like: *"as tuas faturas nunca saem do teu browser; se ativares a partilha de agregado, so os
  totais por teto sao enviados."* Still a strong claim, and an honest one. Shipping the feature
  without fixing this sentence would be the worst outcome here.

## Open questions

- Retention: buckets should expire (a year? two?). Nothing should live forever by default.
- Write authorisation: anyone knowing a room key can overwrite its numbers. Low stakes (worst case
  someone corrupts their own household's estimate) but worth a think.
- Does it need the partner's numbers separately, or just a merged total? Merged is simpler and
  leaks less; separate lets each person see their own contribution.
