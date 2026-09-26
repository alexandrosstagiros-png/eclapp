# Fleet maintenance implementation contract

Native ЕЦЛ module at `/fleet-maintenance`, with the existing full scope tuple and session revalidation. Read roles: access_admin, manager, mechanic, auditor, additionally requiring financeVisible on the scope (access_admin also requires this grant). Writes: access_admin, manager, mechanic, with financeVisible. Auditor read only. No changes to existing trip/vehicle identities or financial postings. PowerPoint route: `GET /fleet-maintenance/report.pptx`, using the same filter query as analytics and CSV.

## Model and ingestion

Domain implementation owns `recovered/apps/api/src/modules/fleet-maintenance/fleet-model.js` and `fleet-workbook.js`. API owns `fleet-maintenance.module.js` and migration 034. Frontend owns `office-web/src/fleet-maintenance.js` and `assets/fleet-maintenance.css`. Root owns integration wiring, dependencies, installation, browser checks, docs.

CommonJS exports:
- `parseWorkbook(buffer, filename)` async -> `{rows, referenceVehicles, reconciliation, metadata}`. Reads actual `Позиции` rows, never dashboard formulas. Required amounts are integer kopecks; exact source amount authoritative, qty×price discrepancies are findings, not corrections. Preserve duplicate lines. Limit uploads 20 MiB, expansion 160 MiB and rows 100000; reject invalid/empty source explicitly with Russian safe message. Accept source xlsx and CSV with Позиции headers. Reference and reconciliation absent are allowed.
- `analyze(rows, filters={}, links=[])` -> `{filters, summary, months, groups, nodes, vehicles, vehicleGroups, positions, suppliers, tree, options, quality, details:{items,total,page,pageSize}, limits}`.
- `reconcile(reconciliation, rows, links=[])` -> `{kind, notice, rows, summary}` (saved discrepancy snapshot is explicitly partial and historical, never pretend full independent ledger).
- `normalizePlate(value)` and `validateFilters(input)` exported.

Row shape: `{sourceRow, orderId, orderNumber, openedOn, completedOn, plate, vehicleBrand, vehicleGroup, vehicleYear, vehicleType, odometerKm, positionType, group, node, name, partBrand, quantity, unit, unitPriceCents, amountCents, topUp, tire, supplier, ownWorkReported, status, autoGroup, autoNode}`. Dates ISO YYYY-MM-DD or null; empty text ''; positionType Russian работа/запчасть; numbers nullable except amountCents; booleans actual booleans. Every row preserves sourceRow. No guessed discount/return semantics and no automatic alias or duplicate deletion.

Filters: `dateFrom,dateTo,dateBasis` (completed/opened, default completed), `vehicleGroup,vehicleKey,group,node,positionType,supplier,search,orderId,issueCode`, `status` (all/finished/unfinished, default all), `page` (1+), `pageSize` (default50,max200). All aggregates use entire matched set; pagination applies only details. Missing completion date is excluded only when a date bound is requested and counted in diagnostics. Query dates invalid or from>to fail. Use authoritative amounts with integer addition and overflow protection. `vehicleKey` defaults normalized plate; confirmed link overrides.

Summary: `{amountCents,laborCents,partsCents,tireCents,rowCount,orderCount,vehicleCount,averageOrderCents,averageVehicleCents,laborShare}`. No-data averages/share null, totals0. Aggregate entry: `{key,label,amountCents,laborCents,partsCents,rowCount,orderCount,vehicleCount}` plus vehicle entries `plate,vehicleGroup` and group entries `share`. Months keys YYYY-MM. Tree entries group aggregate + `children` node aggregates + children name aggregates. Summary and aggregations full, never silently truncated. Positions aggregated by name and type, supplier missing label 'Не указан' without treating ownWorkReported as confirmed internal labor. Details items row plus vehicleKey and issueCodes.

Options: `{vehicleGroups,vehicles,groups,nodes,positionTypes,suppliers,statuses}` as `{key,label}[]`; options derive current source (not workbook dropdowns), excluding their own respective filter so selections remain usable. Quality `{issueCount,affectedRows,items:[{code,label,severity,count,amountCents,examples:[{sourceRow,orderId,plate,message}]}]}` full filtered scope diagnostics; include duplicate_candidates, amount_adjustment, negative_amount, unfinished_completed, missing_supplier, unknown_classification, missing_odometer, odometer_decrease, missing_vehicle_reference where available. Duplicate candidates retained. Coverage/baseline labels truthful.

Links: `{plate,vehicleKey,canonicalPlate,reason}`; user explicitly confirms stable vehicle identity in reason (VIN/ID evidence), all linked plates mapped to shared vehicleKey. Unlink by PUT with empty vehicleKey. Reversible, versioned, scoped, audited. Never auto-confirm suspected pairs.

## HTTP contract

All endpoint parameters include responsibilityScopeId except context.
- GET `/context` -> `{scopes:[{responsibilityScopeId,legalEntityId,regionId,projectId,projectName,regionName,scopeName,canWrite}]}`.
- GET `/fleet-maintenance?...filters` -> `{dataset:null|{id,fileName,fileHash,createdAt,rowCount,metadata},version,links,analytics:null|analyzeResult}`. Empty scopes version0.
- POST `/imports/preview` multipart file field `file`, text `responsibilityScopeId` -> `{dataset,version,summary,quality,alreadyActive}`. Store immutable staged dataset. No changes to active selection. Do not accept frontend-computed sums.
- POST `/imports/commit` JSON `{responsibilityScopeId,datasetId,expectedVersion}` -> `{dataset,version,alreadyActive}`. Atomic snapshot replacement, not additive; retain previous datasets/history. Same active hash idempotent. Reject stale version409; scope locks serialize. Never delete older datasets.
- GET `/imports?responsibilityScopeId` -> `{items:[dataset]}` activation history optional dataset. Each dataset has id,fileName,fileHash,createdAt,rowCount,metadata.
- PUT `/vehicle-links` JSON `{responsibilityScopeId,plate,vehicleKey,canonicalPlate,reason,expectedVersion}` -> `{version,links}`.
- GET `/reconciliation?responsibilityScopeId` -> reconcileResult, or kind none.
- GET `/export?responsibilityScopeId&...filters` -> CSV file, every matched row (not page), BOM UTF8, protect formula injection, Content-Disposition safe filename. CSV read authorization same as analytics.

Frontend factory `createFleetMaintenanceWorkspace(React,{request,authenticatedFetch})`, props `{token,actor,onExpired,onDirtyChange}`. request is existing JSON helper; authenticatedFetch for FormData/CSV. Main tabs Обзор / Позиции / Качество данных / Сверка / История загрузок. Filter edits reload one authoritative calculation; click aggregates to drill into detail; tree expand local. Show source filename and active import timestamp, all-status policy and zero-results. Preview before commit with explicit replace snapshot action; scope changes invalidate preview and stale requests. All writes disabled when !canWrite. Link editor under Сверка with explicit confirmation + reason. Render source text safely as React content.
