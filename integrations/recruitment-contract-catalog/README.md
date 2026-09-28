# Recruitment contract catalog migration

`import_catalog.py` reads the original workbooks without modifying them and
builds `recovered/apps/api/src/modules/recruitment/contract-catalog.json`.
The application needs only this JSON file. It does not need Python, Excel, the
original workbooks, formula caches, or this importer to render documents.

The catalog contains 37 templates: 19 nonempty employee documents, two newly
written forms for the empty checklist and acknowledgment sheets, and 16 carrier
documents (contract, trip request, and 14 separately selectable projects).
Registers, lookup sheets, employee records and vehicle records are excluded.

Run with the bundled Python runtime and explicit source paths:

```sh
python3 integrations/recruitment-contract-catalog/import_catalog.py \
  --employee '/path/to/Оформление ТК.xlsx' \
  --carrier '/path/to/Перевозчиков Оформление .xlsx'
python3 integrations/recruitment-contract-catalog/test_catalog.py -v
```

Alternatively, `--dumps /path/to/directory` accepts the read-only source dumps
`book1.json` and `book2.json`, containing cell address, value and type. Cached
formula results in a dump are ignored. Unknown formula expressions stop the
import rather than generating placeholders with incomplete content.

`source-coverage.json` accounts for all 1,014 nonempty source document cells by
source workbook, sheet, address, conversion method, and SHA-256 of the source
cell expression/value. It contains no employee records or cell values. All 35
nonempty document sheets are accounted for; the other two forms are explicitly
marked as newly authored in their notes.

## Adaptations

- Excel text concatenations, dates, lookups and name declension are replaced
  with declared application fields. Dates use the existing application date
  renderer. Identification and signature blocks use neutral labels instead of
  computing grammatical cases or assuming that a sole proprietor is a director.
- Organisation, signer, employee, carrier, third-party payee and vehicle
  identities are fields with no private default values. The broken Excel
  `DUMMYFUNCTION` fallback is never used.
- Company and carrier names are full legal names; the carrier's legal form is
  not prepended again. The signature title is `carrier_signer_title`, matching
  the company lookup adapter. Passport series and subdivision code are optional
  for documents that do not have them. Citizenship is a field where the source
  had fixed Russian citizenship.
- The base employee selection has eight documents. Vehicle handover and lease
  documents are optional. Carrier onboarding selects the main contract; the
  trip-specific request is optional. All original alternatives remain available.
- Each project has its own `<project>_supplement_number` and
  `<project>_supplement_date` fields, so selecting several projects does not
  force identical supplement numbers or dates. The reserved `contract_number`
  is used consistently for references to the base contract.
- The employee checklist and acknowledgment sheet were empty in the source.
  Their new forms are clearly identified as such. Acknowledgment requires a
  separately entered actual acknowledgment date and a document/version list;
  no acknowledgment date is prefilled.
- Employee acknowledgment footers also use the separately entered actual
  acknowledgment date instead of assuming it equals the contract date. Source
  paragraph continuations split by print pages are rejoined. Multiline party
  details are separated into distinct blocks; tariff table columns stay intact.
- The source salary-payment application is explicitly labelled as payment to
  a third party. Employee identity/signature fields and `payee_*` fields remain
  separate; there is no invented own-account salary application in this catalog.
- Source legal and business terms are retained, including disputed sanctions,
  tariff boundaries, paper-original clauses, the rental amount, and the fuel-card
  clause. Notes identify material issues for review without silently changing
  those terms.
- The trip request's tax treatment and payment period are required fields with
  no default. Opticom's two inconsistent tax/tariff blocks are preserved in full
  in template notes for reference; the corresponding required document fields
  start empty and require agreed wording. No incorrect rate is auto-applied.
- Existing blank form fields for bank payments, driver details, vehicle
  condition and inventory are writable fields. Original substantive clauses
  and the Abrau tariff matrix are retained.

## Verification

The tests cover all 37 template identities and selection defaults, field limits
and placeholder declarations, valid field types and rendering, project-number
separation, significant clauses and the tariff matrix, absence of raw identity
numbers and Excel expressions, complete source-cell accounting, and deterministic
rebuilding. When original dumps are available they also poison all formula
caches and excluded registers to prove these cannot affect the document catalog.
Set `CONTRACT_SOURCE_DUMPS` to their directory for the source-dependent test.

The migration was also compared directly against a fresh read of both original
XLSX files: the generated catalog was identical to the dump-based build.
These checks establish migration integrity; they do not certify legal validity
of the source terms.
