# Household ceiling sharing

Status: implemented behind an explicit opt-in; public distribution remains disabled.

## Purpose

Some IRS deduction ceilings apply to the household, while one e-Fatura session exposes only one
person's records. Looking at one account can therefore undercount how much of a shared ceiling has
already been used. Household sharing lets browsers merge only the totals used against six ceilings.

No real-account examples or measurements belong in this document. Correctness is covered with
synthetic fixtures and the calculation tests.

## Data model

Each browser generates:

- a 256-bit random hexadecimal room key, which is the shared secret;
- a random per-browser member identifier;
- non-negative totals for `C05`, `C06`, `C07`, `C08`, `C99` and the shared IVA pot (`POT`).

The key is not derived from a NIF, email, name or any other account field. Fiscalidade does not need
to read those fields for this feature. No invoice, merchant, date or per-purchase amount is sent.

The room key must be treated like a password: anyone who has it can read and update that room. There
is no recovery mechanism and the server cannot associate the room with a person.

## API contract

The browser uses the branded `/api/v1/households/{room}` routes:

- `PUT` requires `consent: true`, a valid member identifier and only the six known totals;
- `GET` returns merged totals and truncated member identifiers;
- `DELETE` requires a member identifier and removes only that member's row.

Rows expire 400 days after their last update by default. The room key is redacted from access-log
paths. The first-party facade has a 64 KiB request-body cap and forwards only these explicit methods
to a fixed HTTPS upstream.

## Threat model and limits

- Opt-in is off by default and household sharing is independent of all other contribution choices.
- The room key provides authorization. A leaked key permits tampering with that room's estimate.
- The member identifier prevents an ordinary leave action from deleting every member, but it is not
  a separate authentication factor.
- Server data is pseudonymous aggregate tax information, not anonymous in the absolute sense: IP
  addresses are visible transiently to the network/server for delivery and rate limiting.
- The estimate is advisory. Users must verify the official result with AT.

The old deterministic `KDF(NIF + email)` design is retired. It was guessable for targeted users and
could not pair two people who supplied different inputs. Tests and privacy documentation must fail
if a user NIF or email is reintroduced into the household flow.
