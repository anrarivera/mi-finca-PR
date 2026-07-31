# Mi Finca PR — SDD v1.0.0, Amendment B: Scouting, Page Architecture & Hardening

| | |
|---|---|
| **Amends** | Software Design Document v1.0.0 (April 2026), after Amendment A |
| **Date** | July 2026 |
| **Author** | Angel R. Rivera (with Claude Code) |
| **Branches** | `scouting` (merged via PR #20), `mvp-completion` |
| **SRS** | Requirements added as SRS v1.3.0 §3.9 (FR-SC1…9) |

Amendment A recorded the backend build-out. This amendment records three
things added after it: the **scouting subsystem** (not in the original SDD),
a **page-architecture split**, and **build/validation hardening**.

---

## 1. Scouting subsystem (new — no SDD section)

### 1.1 Design principles
- **Findings record what the farmer SAW; operations record what they DID.**
  Findings are a separate entity, linked to a treatment labor only by id
  reference (`treatmentRecommendedOperationId`), never merged into the log.
- **Findings precise, treatments coarse.** A finding's scope goes down to
  individual plants; "Crear labor" creates ONE spray recommendation whose
  suggested rows travel in its notes — the farmer confirms real scope at
  check-off with the normal selector.
- **Severity is judgment, extent is derived.** Severity 1–3 (leve/moderada/
  severa) is entered by the scout — intensity per plant. Extent (incidencia,
  % of field) is computed from the scope and never entered.
- **The finding mirrors its latest observation.** Re-inspections
  ("seguimientos", the Parcial of findings) append to
  `finding_observations`; the finding's own severity/scope always equal the
  last one, so map paint and field health need no history walk.

### 1.2 Schema additions

| Table | Notes |
|---|---|
| `findings` | fieldId, pestId, severity, status (`open`/`treated`/`resolved`, manual), foundDate, notes, rowIds/plantIds (JSON, same tri-level scope shape as operations), treatmentRecommendedOperationId (SetNull on labor deletion) |
| `finding_observations` | findingId (Cascade), date, severity, rowIds/plantIds, notes. Every finding owns ≥ 1 (created with it; backfilled for pre-existing rows) |

### 1.3 API (mounted at `/api/v1/farms/:farmId/findings`)

| Endpoint | Purpose |
|---|---|
| `GET /` | List (filters: `fieldId`, `status`), observations included oldest-first |
| `POST /` | Create finding + its first observation atomically |
| `PATCH /:id` | Status lifecycle + corrections |
| `DELETE /:id` | Hard delete (labores it created live on) |
| `POST /:id/observations` | Append a re-inspection; mirrors latest severity/scope onto the finding |
| `POST /:id/create-operation` | One coarse treatment recommendation; allowed again once the previous labor is completed/skipped |
| `GET /export?format=csv` | Sanitary record, one row per observation (certifier "papel") |

### 1.4 Frontend (`frontend/src/features/scouting/`)
Pest library (Spanish-first, keyed by crop; field's crops suggested first) ·
capture/re-inspection modal reusing the operations scope selector with map
taps · findings card in the operations drawer (trend cue mejorando/
empeorando/estable, observation trail rendered like partial logs) · map
paint of unresolved findings by severity · **field health traffic light**
(`fieldHealth`): gray bare / green healthy / severity color alerting —
severa at any extent, leve/moderada past a 10 % extent threshold,
treated-only desaturated. The stored `fields.color` column is kept but no
longer displayed.

---

## 2. Page architecture (supersedes the Amendment A additions list)

Pages split **by time** (July 2026):

- **Panel de control** — the today page: stat tiles, **Labores panel**
  (server-backed by `GET /recommended-operations/due-soon`, so livestock
  labores appear; rows checkable in place with Completa/Parcial/Omitir and
  the centered check-off modal), Recomendaciones, and the Sanidad alerts
  (traffic-light strip + active findings).
- **Cuaderno de campo** (renamed from Inventario; route `/inventory`
  unchanged) — the records book, tabbed: Siembras (inventory grid) ·
  Labores (operations log + month calendar) · Cosechas · Sanidad
  (recurrence, full history, CSV export) · Animales.

---

## 3. Hardening (July 2026)

- **Both production builds and lint are green** — frontend `tsc -b` + Vite,
  backend `tsc`, ESLint (config moved into `frontend/` where its plugins
  live; 0 errors). Dead mock scaffolding (`farmStatBar`, `useFarms`) removed;
  `areaAcres`/`plantCount` became derived values (also fixing `loadBoundary`
  storing square meters as acres).
- **NFR-4 closed:** coordinates are bounds-checked server-side (lat ±90,
  lng ±180) on every geometry input — farm boundary updates, field
  boundary/placement/rows/plants, livestock placement pins
  (`requireLat`/`requireLng`/`requireBoundaryBounds` in `lib/validate.ts`).
- **Still deferred:** backend Jest suite refresh (tests predate schema
  changes; ⚠️ the suite currently connects with the dev `DATABASE_URL` and
  its cleanup wipes all tables — do not run until a test database is wired),
  and everything on Amendment A §3's Phase 2 list.

---

## 4. Amendment history

| Amendment | Date | Changes |
|---|---|---|
| A | July 2026 | Backend build-out, MVP wiring, deviations, Phase 2 deferrals |
| B | July 2026 | Scouting subsystem (findings + observations + sanidad), today-page/cuaderno split, actionable Labores panel, builds/lint green, server-side coordinate bounds |
