# Mi Finca PR — Software Requirements Specification (SRS)

| | |
|---|---|
| **Version** | 1.2.1 (Markdown edition) |
| **Status** | Active |
| **Date** | July 2026 |
| **Author** | Angel R. Rivera |
| **Scope** | Phase 1 — Farm Management Tool |
| **Related** | SDD v1.0.0 (+ Amendment A), README.md |

> **Note on this edition.** SRS v1.2.0 was maintained as a Word document outside
> the repository. This v1.2.1 Markdown edition brings the requirements into the
> repo so they can be versioned alongside the code, and adds an
> **implementation status** to every requirement reflecting the codebase as of
> the `mvp-completion` branch (July 2026). Status legend:
> ✅ Implemented · 🟡 Partial · 📋 Planned (with target phase).

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for
**Phase 1 of Mi Finca PR**, a farm management platform for small and mid-size
agricultural operations in Puerto Rico and the Caribbean. It defines *what*
the system must do; the companion SDD defines *how* it is built.

### 1.2 Product Vision
Mi Finca PR is a three-phase product:

| Phase | Name | Scope of this SRS |
|---|---|---|
| **1** | Farm Management Tool | **Yes — this document** |
| 2 | Knowledge Base + AI Recommendations | No (referenced where Phase 1 must be forward-compatible) |
| 3 | Agricultural Marketplace | No |

### 1.3 Definitions
- **Farm** — a user-owned property with a geographic boundary, drawn on satellite imagery.
- **Field** — a planted area inside a farm boundary, with rows, free plants, and crops.
- **Planting Event** — the grouping of all plants of one crop type planted on one date in one field; the anchor for the operations calendar.
- **Recommended Operation** — a calendar entry generated from a crop schedule template (e.g. "first fertilization, 21 days after planting").
- **Operation** — a real, logged action the farmer performed (fertilized, sprayed, harvested…). May confirm a Recommended Operation ("check-off").
- **Livestock Unit** — a named group of animals (e.g. "Gallinero Norte", 25 laying hens).
- **Harvest Yield** — a production record (crop, quantity, unit, date), created automatically when a harvest operation is checked off.

### 1.4 Users
| User class | Description |
|---|---|
| Farmer (primary) | Owner/operator of one or more farms. Spanish-speaking, mobile-first in the field, desktop for planning. Not assumed technical. |
| Agronomist / advisor (secondary) | Reviews a farmer's logs and calendar. Phase 1 supports this only through the farmer's own account. |

---

## 2. Overall Description

### 2.1 Operating Environment
- **Web (desktop)** — React SPA, evergreen browsers. ✅ Implemented.
- **Mobile (iOS/Android)** — React Native + Expo app with offline logging. 📋 Planned (Phase 2). Phase 1 ships the responsive web app only.
- **Backend** — Node.js REST API + PostgreSQL, deployable to any Node host. ✅ Implemented.

### 2.2 Constraints
- All UI copy is Spanish (Puerto Rico). English localization is 📋 Phase 2.
- All spatial data is stored as WGS84 lat/lng — never pixels (see SDD §2.2.3).
- Farm data is strictly isolated per user account at the API layer.
- Hardware (irrigation etc.) is never controlled directly; the system may only receive sensor data and emit webhook events. 📋 Phase 2.

### 2.3 Assumptions
- Users have intermittent but generally available connectivity (offline queue is Phase 2).
- Satellite imagery is available for Puerto Rico through public ESRI ArcGIS endpoints without an API key.

---

## 3. Functional Requirements

### 3.1 Accounts & Authentication

| ID | Requirement | Status |
|---|---|---|
| FR-A1 | Users can register with email + password (min 8 chars); passwords stored hashed (bcrypt). | ✅ |
| FR-A2 | Users can log in and receive a short-lived access token (15 min, in memory) and a long-lived refresh token (30 days, HttpOnly cookie). | ✅ |
| FR-A3 | Sessions refresh silently on app load; refresh tokens are single-use and rotated. | ✅ |
| FR-A4 | Users can log out, revoking the refresh token server-side. | ✅ |
| FR-A5 | Users can verify their email via a single-use emailed link with a landing page in the app. | ✅ |
| FR-A6 | Users can reset a forgotten password via a single-use emailed link (2 h expiry); all sessions are revoked on reset. | ✅ |
| FR-A7 | Users can change their account email (re-authentication + confirmation link sent to the new address). | ✅ |
| FR-A8 | Users can sign in with Google (OAuth). | 📋 Phase 2 — schema (`oauth_accounts`) exists |
| FR-A9 | Auth endpoints are rate-limited (20 attempts / 15 min / IP). | ✅ |

### 3.2 Farms

| ID | Requirement | Status |
|---|---|---|
| FR-F1 | Users can create, rename, describe, and delete farms (soft delete; deleting cascades to fields and livestock). | ✅ |
| FR-F2 | Users can draw a farm boundary on satellite imagery; area (acres) is computed from the boundary. | ✅ |
| FR-F3 | Users can manage multiple farms and mark one favorite, shown first on app open. | ✅ |
| FR-F4 | A farm dashboard summary reports field count, total acreage, operation health (overdue / due-soon counts), and the last logged operation. | ✅ |

### 3.3 Fields & Planting

| ID | Requirement | Status |
|---|---|---|
| FR-C1 | Users can draw rectangular or polygonal fields in a dedicated field editor; boundaries are persisted as lat/lng. | ✅ |
| FR-C2 | Fields must lie entirely inside the farm boundary; the server rejects violations (`El campo debe estar dentro del límite de la finca`). | ✅ |
| FR-C3 | Users can add crop rows with configurable spacing; plant positions are computed and stored individually. | ✅ |
| FR-C4 | Rows support a companion crop alongside the primary crop. | ✅ |
| FR-C5 | Users can place individual free-standing plants. | ✅ |
| FR-C6 | Plants of the same crop planted the same date in the same field are grouped into a Planting Event. | ✅ |
| FR-C7 | The crop library ships with built-in crops (with Spanish names, emojis, categories) and users can define custom crops. | ✅ |
| FR-C8 | A row-fill tool can populate a field boundary with evenly spaced rows automatically. | ✅ |

### 3.4 Operations Calendar & Logging
*The core loop: an operation must be loggable in under 30 seconds.*

| ID | Requirement | Status |
|---|---|---|
| FR-O1 | Creating a Planting Event generates a Recommended Operations calendar from the crop's schedule template (offsets from planting date). | ✅ |
| FR-O2 | The calendar shows operations grouped by planting event, ordered: overdue → due soon → upcoming → completed. | ✅ |
| FR-O3 | Users can check off a recommended operation with date (default today), type-specific product/quantity fields, and notes. | ✅ |
| FR-O4 | Checking off atomically: creates an Operation log entry, marks the recommendation completed, and links the two (`completedOperationId`). | ✅ |
| FR-O5 | Users can skip a recommended operation; skipped items remain visible, greyed out. | ✅ |
| FR-O6 | Users can log standalone operations not tied to a recommendation (farm- or field-level). | ✅ API — dedicated UI 🟡 |
| FR-O7 | The operations log is filterable (type, field, livestock unit, date range) and exportable as CSV. PDF export is 📋 Phase 2. | ✅ |
| FR-O8 | Deleting a logged operation reverts its linked recommendation to pending. | ✅ |
| FR-O9 | Operation photos can be attached (max 10 MB, images only). | 📋 Phase 2 — requires file storage (R2/S3) |
| FR-O10 | Completed harvest operations automatically create a Harvest Yield record (crop, quantity, unit, date). | ✅ |

### 3.5 Livestock

| ID | Requirement | Status |
|---|---|---|
| FR-L1 | Users can register livestock units (chickens, rabbits, goats, cows, pigs, bees) with name, count, and acquisition date. | ✅ |
| FR-L2 | Livestock units belong to a farm and persist to the backend (not only local storage). | ✅ |
| FR-L3 | Livestock care schedules generate recommended operations (feeding, health treatment, breeding). | 📋 Phase 2 — schema supports it |
| FR-L4 | Livestock-specific operations (feeding, health treatment, production records) can be logged against a unit. | ✅ API — dedicated UI 📋 Phase 2 |

### 3.6 Recommendations

| ID | Requirement | Status |
|---|---|---|
| FR-R1 | A rule-based engine produces farm-level recommendations (e.g. density warnings, overdue alerts). | ✅ |
| FR-R2 | The engine is a swappable service interface so an LLM-powered implementation can replace it with no UI changes. | ✅ interface in place |
| FR-R3 | Recommendation statuses refresh as dates pass (pending → due). | ✅ client-side |

### 3.7 Farm Viability Simulator

| ID | Requirement | Status |
|---|---|---|
| FR-S1 | Users can run financial projections (setup cost, annual cost/revenue, break-even year) for a farm model applied to their acreage. | ✅ client-side |
| FR-S2 | Pre-built farm model templates (crop mixes with percentage allocations) ship with the app. | ✅ |
| FR-S3 | Applying a model creates simulated fields (`isSimulated`) distinguishable from real ones. | 🟡 schema ready; apply-model endpoint 📋 Phase 2 |
| FR-S4 | Crop economics (yield, price, costs) are data, not code, so they can be updated without releases. | 🟡 client data file; server `crop_types` economics 📋 Phase 2 |

### 3.8 IoT & Automation — 📋 Phase 2 (schema shipped in Phase 1)

| ID | Requirement | Status |
|---|---|---|
| FR-I1 | Sensors register per farm and ingest readings via a per-sensor API key (`POST /ingest/sensor`). | 📋 Phase 2 — `sensors`, `sensor_readings` tables exist |
| FR-I2 | Automation rules combine a sensor condition with an optional weather-forecast condition and fire a notification, log entry, or webhook. | 📋 Phase 2 — `automation_rules` table exists |
| FR-I3 | The system never actuates hardware directly — webhook emission only. | Design constraint, carried to Phase 2 |

### 3.9 Data & Settings

| ID | Requirement | Status |
|---|---|---|
| FR-D1 | Users can export, restore, and wipe their local data from Settings. | ✅ |
| FR-D2 | Users can configure notification preferences, persisted server-side. | ✅ |
| FR-D3 | Pending operations can be exported to calendar apps (ICS / Google Calendar link). | ✅ |
| FR-D4 | Language (es/en) and unit system (imperial/metric) preferences exist per user. | 🟡 stored; UI is Spanish/imperial only — switching 📋 Phase 2 |

---

## 4. Non-Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-1 | **Data isolation:** every farm-data query is scoped to the authenticated user; cross-account access is impossible at the API layer. | ✅ |
| NFR-2 | **Speed of logging:** checking off an operation takes ≤ 30 s and ≤ 3 taps from the operations view. | ✅ |
| NFR-3 | **Security:** access tokens never in localStorage; refresh tokens HttpOnly; single-use hashed email tokens; bcrypt cost 12; Helmet + CORS allow-list. | ✅ |
| NFR-4 | **Validation:** all inputs validated server-side (Zod on auth/crops/users; field-level validators elsewhere); coordinates bounded (lat ±90, lng ±180 — 🟡 enforced client-side, server-side pending). | 🟡 |
| NFR-5 | **Availability of map data:** satellite tiles require no API key. | ✅ |
| NFR-6 | **API convention:** all JSON responses use `{ success, data | error: { code, message, details? } }`; errors use standard codes (SDD §11). | ✅ |
| NFR-7 | **Offline logging** (mobile queue with retry). | 📋 Phase 2 |
| NFR-8 | **Localization-ready:** UI copy centralizable for an English locale. | 📋 Phase 2 |

---

## 5. External Interfaces

| Interface | Purpose | Status |
|---|---|---|
| ESRI ArcGIS MapServer | Satellite imagery (no key) | ✅ |
| Resend | Transactional email (verification, reset, change-email) | ✅ |
| Open-Meteo / OpenWeatherMap | Forecast data for automation rules | 📋 Phase 2 |
| Expo Push Notifications | Mobile alerts | 📋 Phase 2 |
| Cloudflare R2 / AWS S3 | Operation photos | 📋 Phase 2 |
| Google OAuth | Social sign-in | 📋 Phase 2 |

---

## 6. Phase 1 Acceptance (MVP definition)

Phase 1 is accepted when a farmer can, end to end and persisted server-side:

1. Register, verify their email, and log in. ✅
2. Create a farm and draw its boundary on satellite imagery. ✅
3. Draw fields, plant crop rows, and get a generated operations calendar. ✅
4. Check off / skip calendar operations and see the log update everywhere. ✅
5. Register livestock and see it on any device they log into. ✅
6. Export their operations log (CSV) and calendar (ICS). ✅
7. Run a viability simulation for their acreage. ✅

Items marked 📋 above (mobile app, offline queue, IoT, OAuth, photos, i18n)
are explicitly **out of Phase 1 acceptance** and tracked for Phase 2.

---

## 7. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2025 | Angel R. Rivera | Initial SRS (Word) |
| 1.2.0 | 2026 | Angel R. Rivera | Field editor rework, planting events, simulator (Word) |
| 1.2.1 | July 2026 | Angel R. Rivera (with Claude Code) | Markdown edition committed to repo; per-requirement implementation status; Phase 1 acceptance criteria |
