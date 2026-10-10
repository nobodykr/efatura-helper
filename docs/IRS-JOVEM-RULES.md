# IRS Jovem source boundary

Reviewed on 10/10/2026. These public statutory parameters contain no taxpayer data.
The new registry keys support income years 2025 and 2026. Values for 2023 and 2024
are explicitly unknown in this slice, not zero and not the newer regime.

## Eligibility and exemption

[CIRS 12-B, current AT rendering](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs12b.aspx)
and [Lei 45-A/2024, articles 89 and 116(2)](https://diariodarepublica.pt/dr/detalhe/lei/45-a-2024-901667918)
provide the age limit, election, income-year count, schedule and exclusions. The
current DR amendment history lists no later amendment to CIRS 12-B. Assess age on
31 December of the income year. Historical receipt of A/B income matters even if
IRS Jovem was never claimed. A year with both categories counts once.

For eligible gross A/B income G, counted income year n, and that year's IAS:

- n = 1: percentage 100%; n = 2 through 4: 75%; n = 5 through 7: 50%;
  n = 8 through 10: 25%.
- Exempt income E = min(G * percentage / 100, 55 * IAS).
- Gross income remaining subject to tax = G - E. This is not taxable income after
  deductions and must not be labelled final IRS or a refund.
- The cap is shared across A and B. Do not grant two caps or cap G before applying
  the percentage. IAS is already a verified annual registry rule: the resulting
  cap is 28 737,50 EUR for 2025 and 29 542,15 EUR for 2026.

The [current AT leaflet](https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Folhetos_informativos/Documents/Folheto_IRS_jovem_2025.pdf)
was 20 pages when reviewed. Pages 3-4 exclude years without A/B income, dependent
years and years dispensed from filing under CIRS 58. Case 5 on page 9 illustrates
an omitted filing with lawful dispensation. Absence of a return alone is not proof
of dispensation. This clarification is separately identified as AT guidance, not
inserted into the quoted wording of the transition law. The URL is mutable;
page 5 references Decreto Regulamentar 5-A/2026, identifying the reviewed edition.
If the person could file voluntarily despite dispensation, confirm the counted
year against AT's IRS Jovem record rather than inventing an interpretation.

RNH or IFICI previously enjoyed, opting for the ex-resident regime, and an
unregularised tax position are disqualifiers. A missing answer remains unknown.
Employer withholding treatment is not proof of annual eligibility. The leaflet
also excludes third-party gratuities taxed at a special rate (page 4).

## Rates and deductions

[CIRS 22(4) and 22(7)(a)](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs22.aspx)
retain exempt income, without deductions, when determining the general rate on
the remaining taxable income. Given an independently established taxable base R
and exempt amount E, progression uses R + E. In the ordinary single-person
calculation, the general-rate component before deductions is T(R + E) * R /
(R + E), with zero when R + E is zero. This statement does not establish R,
minimum-existence relief, solidarity tax, special rates or the final assessment.
Other income categories are not exempt under IRS Jovem; aggregation and special
rates must be established separately.

[CIRS 25](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs25.aspx)
provides the specific deduction, including mandatory contributions above the
statutory floor. Do not infer a proportional IRS Jovem deduction merely from its
exemption percentage. The historical [AT 2021 liquidation manual](https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Manuais/Documents/Regras_Liquidacao_IRS_2021_Residentes.pdf)
page 21, note 2(3), allocates deductions across exempt/nonexempt income but
preserves the minimum specific deduction and caps at nonexempt gross income.
Pages 9-10 separate rate-base tax from the exempt-income share. This historical
manual corroborates progression mechanics; it does not verify every 2025/2026
IRS Jovem deduction interaction. This slice deliberately does not certify that
allocation or a final annual refund.

For category B, [AT binding-information process 28155](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vinculativas/rendimento/cirs/Documents/PIV_28155.pdf),
page 3 paragraph 6, confirms that the exemption concerns gross professional
income. Applying a simplified-regime coefficient first would change the exempt
amount. The ruling does not supply a complete algorithm for coefficients,
expense justification, start-of-activity reductions and mixed A/B allocations;
those interactions remain outside this slice.

## Earlier years

[The AT's archived CIRS 12-B wording for 2024](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/ra/Pages/irs12bra_202412.aspx)
requires the qualifying education cycle and has five income years. The schedule
is 100%, 75%, 50%, 50%, 25%, with respective caps of 40, 30, 20, 20 and 10 IAS.
Entry age is 18-26, extended to 30 for QNQ level 8; continuation cannot exceed
35. Education completed in the income year does not unlock that same year.
These facts explain the deliberate unknown historical entries; they are not a
complete eligibility implementation for historical claims.

## Verification and consumers

The source registry stores current AT article text and the original promulgated
DR law independently. The AT leaflet is marked as manually reviewed because the
existing source checker handles HTML, not PDF. The immutable law confirms the
2025 transition; current article rendering detects subsequent amendments.
The existing IAS rules retain their own annual DR provenance, corroborated for
2026 by [AT newsletter 39](https://info.portaldasfinancas.gov.pt/pt/at/Divulgacao/publicacoes_internas/Newsletter_AT/Documents/Newsletter-39-janeiro-2026.pdf).

Consumers must check verified and income year, and use the registry's source
references. The percentage map identifies income years, not the number of
benefit claims. Downstream vendored registries should be copied byte for byte
from the public repository after its commit is merged; no private overlay is
necessary. Run node test-rule-registry.js and node test-audit-sync.js after
node make-audit.mjs. The audit manifest is generated from the updated registry.
