# Test & scenario coverage (honest ledger)

What has actually been validated, and against what. Kept honest on purpose: overclaiming coverage
is the same "green-but-wrong" trap the audit exists to prevent. This is the floor; the scenario
matrix (Taiga #79) fills the gaps as the tool grows into more regimes. See `/auditoria`.

There are three levels of "tested", and they are NOT the same thing:

## 1. Validated against REAL data (the strongest, and the thinnest)
- **Two real subjects only:** the author's own case and one household member (Inês).
- Both are **employed-worker / e-Fatura consumer** profiles (categoria A income, deductions on the
  consumption side). Rendas/household nuances were exercised on the author's real account.
- That is the entire real-world validation set today. Everything below is synthetic or unmodelled.

## 2. Exercised by SYNTHETIC fixtures (code paths, constructed inputs, not real outcomes)
The `test-*.js` suite runs the code against fabricated invoice/profile data with known expected
results. It proves the code does what it's written to do - not that a real person's return is right.
- `test-outcome.js`, `test-interaction.js`, `test-reclassify.js`, `test-apply.js`, `test-r1.js` -
  the deduction/classification engine over fake e-Fatura rows.
- `test-render.js`, `test-profiling.js`, `test-banner.js`, `test-columns.js`, `test-accordion.js` -
  perfil.html/index.html render with constructed profiles.
- `test-obligations.js`, `test-deadlines.js` - the obligations/deadline engine (detects atividade,
  IVA, categoria B, pensão signals; computes correction windows).
- `test-deducoes-sync.js`, `test-audit-sync.js`, `test-draft.js`, `test-network.js` - invariants
  (three-source agreement, manifest sync, draft-mode safety, no pre-consent requests).

## 3. Modelled but NOT validated end-to-end against reality
The tool *detects/mentions* these, but no real case has confirmed the full outcome:
- **Pensionista / reforma** (categoria H) - detected; no real pensioner return validated.
- **Monoparental** - the 78.º-B monoparental ceiling (45% / 335) exists in the data; not validated
  on a real single-parent household.
- **Trabalhador independente / atividade aberta / recibos verdes** (categoria B) - obligations are
  detected; the *emission* and category-B computation are not a validated flow.
- **Rendimentos prediais** (categoria F) beyond the author's own case.

## Not covered at all (out of current scope)
- **IRC** (companies) - a different code entirely.
- **IVA regimes** end-to-end (trimestral vs mensal, apuramento).
- **Mais-valias (G), capitais (E)** as full scenarios.

## The rule this encodes
You cannot audit the *result* of a regime the tool does not yet compute. So the scenario audit
(#79) and the profile matrix (#31, "matriz de perfis") advance lockstep: each new regime/subject
the tool learns to compute adds (a) its real or well-sourced expected outcome and (b) a fixture +
a row here. Until then, this ledger says plainly what is and isn't validated.
