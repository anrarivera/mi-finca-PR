# Mi Finca PR — SDD v1.0.0, Amendment A: Implementation Status & Deviations

| | |
|---|---|
| **Amends** | Software Design Document v1.0.0 (April 2026) |
| **Date** | July 2026 |
| **Author** | Angel R. Rivera (with Claude Code) |
| **Branch** | `mvp-completion` |

SDD v1.0.0 closes with: *"As of SDD v1.0.0 only the frontend has been
implemented."* That note is now outdated. This amendment records what has
been built since, where the implementation deviates from the original design,
and what remains deferred. The SDD's section numbers are referenced
throughout; the SDD itself is unchanged.

---

## 1. Backend status (supersedes the SDD's "Note on Backend Status")

The backend described in SDD §3–§6 now exists at `backend/`:
**Express 5 + Prisma + PostgreSQL**, JWT auth, mounted under `/api/v1`.

### 1.1 Database schema (SDD §3)
All 14 designed tables exist in `backend/prisma/schema.prisma`, plus four
additions not in the SDD:

| Added table | Why |
|---|---|
| `harvest_yields` | Production records; auto-populated from harvest check-offs |
| `crop_schedules` | Crop operation templates moved to data (SDD §3.3 spirit) |
| `action_tokens` | Single-use hashed tokens for verify/reset/change-email flows |
| `refresh_tokens` | Server-side refresh-token store enabling rotation/revocation |

Deviations from §3:
- `fields.widthFt/heightFt` were **removed** (migration `20260725125915`) —
  boundaries alone are the source of truth, consistent with §1.3.
- `crop_types` does not yet carry the economics columns
  (`expectedYieldLbPerAcre`, `marketPricePerLb`, …); crop economics live in
  `frontend/src/features/simulator/data/cropEconomics.ts` for now.
- `recommended_operations.id` and `planting_events.id` accept
  **client-generated string ids** (`op_<event>_<template>`, `pe_<field>_…`),
  not UUIDs — the calendar is generated client-side (§6.1) and persisted on
  field save, so the client owns those identities.

### 1.2 API endpoints (SDD §4)

| SDD § | Endpoint group | Status |
|---|---|---|
| 4.2 | Auth (register, login, refresh, logout, forgot/reset password, verify email) | ✅ + change-email flow (not in SDD) |
| 4.2 | `POST /auth/google` | 📋 Phase 2 |
| 4.3 | Farms CRUD + `/summary` | ✅ (summary now returns real `operationHealth` counts) |
| 4.4 | Fields CRUD (nested rows/plants/events/recommendations) | ✅ (no separate `GET /fields/:id`; the list returns full objects) |
| 4.5 | Operations CRUD + CSV export | ✅ `backend/src/routes/operations.ts` |
| 4.5 | Operation photo upload, PDF export | 📋 Phase 2 (needs R2/S3) |
| 4.6 | Recommended operations: list, `/:id/complete`, `/:id/skip`, `/due-soon` | ✅ `backend/src/routes/recommendedOperations.ts` |
| 4.7 | Livestock CRUD | ✅ (`/livestock/:id/operations` folded into §4.5 operations with `livestockUnitId`) |
| 4.8 | Sensors, `/ingest/sensor`, automation rules | 📋 Phase 2 — tables exist, no routes |
| 4.9 | Simulator endpoints | 📋 Phase 2 — simulator runs fully client-side |
| — | Harvests CRUD (`/farms/:farmId/harvests`) | ✅ addition, not in SDD |
| — | Crops CRUD (`/crops`, built-in + user-defined) | ✅ addition, not in SDD |
| — | Notification prefs (`/users/me/notification-prefs`) | ✅ addition, not in SDD |

Conventions (§4.1) hold: `{ success, data, error }` envelope, Bearer JWT,
ISO dates, `{ lat, lng }` objects. **Deviation:** pagination is not
implemented anywhere (the SDD specified cursor-based; list sizes in Phase 1
don't warrant it yet).

### 1.3 Check-off data flow (SDD §6.2) — implemented
`POST /farms/:farmId/recommended-operations/:id/complete` performs, in one
transaction:
1. creates the `operations` log row,
2. sets the recommendation `status=completed`, `completedDate`,
   `completedOperationId`,
3. if the operation is a harvest with a quantity, creates a
   `harvest_yields` row (extension beyond the SDD).

Deleting a logged operation reverts its recommendation to `pending`
(not specified in the SDD; chosen to keep the calendar truthful).
Field re-saves preserve `completedOperationId` across the
"replace planting events" PATCH strategy.

### 1.4 Authentication (SDD §5) — implemented, stronger than spec
15-min access token in memory, 30-day refresh in an HttpOnly
`SameSite=Strict` cookie, **plus** (beyond the SDD): server-side refresh
token store with strict single-use rotation, hashed single-use action tokens
for email flows, and session revocation on password/email change.
**Deviation:** sensor API keys (§5.3) are designed hashed; the current
schema stores them plain — must be hashed when §4.8 is built in Phase 2.

### 1.5 Rate limiting (SDD §10.3) — partial
Only auth endpoints are limited (20 req / 15 min / IP). The general,
sensor, and upload tiers from the SDD are 📋 Phase 2.

---

## 2. Frontend status

- Architecture matches SDD §2.2/§7: feature folders, hybrid
  farm/field Zustand stores, TanStack Query server state, lat/lng-only
  persistence, 800×600 SVG field editor canvas.
- **Now wired to the API** (this branch): operations check-off/skip
  (`useOperationsApi.ts`), livestock (`useLivestockApi.ts` — previously
  localStorage-only), CSV export, and email-link landing pages
  (`/verify-email`, `/change-email`).
- Recommendation engine (§8) is client-side behind the
  `RecommendationService` interface as designed; the backend stores whatever
  calendar the client generates. Moving generation server-side is Phase 2.
- Additions not in the SDD: notifications bell (derived client-side),
  inventory page, ICS/Google Calendar export, JSON backup/restore in
  Settings.

## 3. Deferred to Phase 2 (design unchanged)

Mobile app + offline queue (§2.1, §9) · Google OAuth (§4.2) · IoT
ingestion, rule engine, automation log (§4.8, §6.3) · simulator API +
apply-model (§4.9, §6.4) · operation photos + PDF export (§4.5) ·
cursor pagination (§4.1) · full rate-limit tiers (§10.3) · i18n
(es/en switch) · backend test-suite refresh (tests predate schema
changes and are currently stale — known, deliberately deferred).

## 4. Amendment history

| Amendment | Date | Changes |
|---|---|---|
| A | July 2026 | First implementation-status amendment; documents backend build-out, MVP wiring branch (`mvp-completion`), deviations, Phase 2 deferrals |
