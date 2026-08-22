# Test & scenario coverage (honest ledger)

What has actually been validated, and against what. Kept honest on purpose: overclaiming coverage
is the same "green-but-wrong" trap the audit exists to prevent. This is the floor; the scenario
matrix (Taiga #79) fills the gaps as the tool grows into more regimes. See `/auditoria`.

There are three levels of "tested", and they are NOT the same thing:

## 1. Controlled account checks (non-reproducible evidence)

Historical manual checks used a very small number of authorized accounts. Their identities, exact
figures and profile characteristics are intentionally not recorded in this repository. Those checks
can reveal a response-shape change, but they are not reproducible release evidence and do not justify
a claim that a full tax profile is correct.

The 2026 internal-hardening pass did not capture or publish account values. It replaced value-based
debugging with synthetic fixtures, field/type-only schema diagnostics and explicit completeness
failures.

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
  (four-source agreement, manifest sync, draft-mode safety, no pre-consent requests).
- `test-complete-reader.js`, `test-attribution-states.js` - capped-result splitting and the full set
  of attributed document states.
- `test-extension-*.js`, `test-api-facade.js`, `test-shape-contract.js` - extension consent/storage,
  exact permissions, API forwarding boundaries and stable schema identifiers.

## 3. Modelled but NOT validated end-to-end against reality
The tool *detects/mentions* these, but no real case has confirmed the full outcome:
- **Pensionista / reforma** (categoria H) - detected; no real pensioner return validated.
- **Monoparental** - the 78.º-B monoparental ceiling (45% / 335) exists in the data; not validated
  on a real single-parent household.
- **Trabalhador independente / atividade aberta / recibos verdes** (categoria B) - obligations are
  detected; the *emission* and category-B computation are not a validated flow.
- **Rendimentos prediais** (categoria F) as a complete end-to-end tax outcome.

## Not covered at all (out of current scope)
- **IRC** (companies) - a different code entirely.
- **IVA regimes** end-to-end (trimestral vs mensal, apuramento).
- **Mais-valias (G), capitais (E)** as full scenarios.

## The rule this encodes
You cannot audit the *result* of a regime the tool does not yet compute. So the scenario audit
(#79) and the profile matrix (#31, "matriz de perfis") advance lockstep: each new regime/subject
the tool learns to compute adds (a) its real or well-sourced expected outcome and (b) a fixture +
a row here. Until then, this ledger says plainly what is and isn't validated.
