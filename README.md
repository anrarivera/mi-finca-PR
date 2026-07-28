# 🌱 Mi Finca PR

A farm management platform built for small to mid-size agricultural operations in Puerto Rico and the broader Caribbean. Mi Finca PR helps farmers visually map their land, manage crop and livestock inventory, log operations, and receive agronomic recommendations.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Product Phases](#product-phases)
- [License](#license)

---

## Overview

Mi Finca PR is a three-phase agricultural platform:

| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | Farm Management Tool | 🚧 In Development |
| Phase 2 | Knowledge Base + AI Recommendations | 📋 Planned |
| Phase 3 | Agricultural Marketplace | 📋 Planned |

**Phase 1 features include:**
- Visual farm boundary mapping on satellite imagery
- Multi-field management with a persistent Farm Field Editor
- Crop row tool with companion planting support
- Livestock management (chickens, rabbits, goats, cows, pigs, bees), synced to the API
- Operations logging with agronomic calendar check-off flow, persisted server-side, with CSV export
- Automatic harvest yield records from harvest check-offs
- Rule-based recommendation engine (AI-ready interface)
- Farm viability simulator with pre-built farm model templates
- Full email/password auth: verification, password reset, and email change via emailed single-use links
- Multi-farm support with favorite farm navigation
- IoT automation and weather ingestion — schema shipped, endpoints planned for Phase 2

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Component Library | shadcn/ui (Radix) |
| Routing | React Router v7 |
| Global State | Zustand |
| Server State | TanStack Query (React Query) |
| Forms | React Hook Form + Zod |
| Maps | Leaflet + React-Leaflet |
| Icons | Lucide React |
| API Server | Node.js + Express 5 + TypeScript |
| ORM / Database | Prisma 6 + PostgreSQL |
| Auth | JWT (15-min access in memory, 30-day refresh in HttpOnly cookie) |
| Email | Resend (verification, password reset, email change) |
| Backend Tests | Jest + Supertest |

---

## Prerequisites

Ensure you have the following installed before running the project:

- **Node.js** v20.17.0 or higher — [nodejs.org](https://nodejs.org)
- **npm** v11 or higher (comes with Node)
- **PostgreSQL** 15+ — required for the backend API

Verify your versions:

```bash
node --version   # should be v20.17.0+
npm --version    # should be 11+
psql --version   # should be 15+
```

---

## Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/mi-finca-PR.git
cd mi-finca-PR
```

2. **Set up the backend**
```bash
cd backend
npm install
# create a .env (see Environment Variables below), then:
npx prisma migrate dev    # create/update the database schema
npm run seed              # load built-in crop types and schedules
npm run dev               # API at http://localhost:3001
```

3. **Set up the frontend** (separate terminal)
```bash
cd frontend
npm install
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Environment Variables

The **backend** requires a `.env` in `backend/`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets |
| `FRONTEND_URL` | CORS origin + base URL for emailed links (default `http://localhost:5173`) |
| `RESEND_API_KEY` | Transactional email (verification / reset / change-email) |
| `PORT` | API port (default `3001`) |

The **frontend** optionally takes `VITE_API_URL` (defaults to `http://localhost:3001`).

> **Note:** Never commit `.env` files to version control. They are already included in `.gitignore`.

---

## Available Scripts

**Frontend** (`frontend/`):

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server at localhost:5173 |
| `npm run build` | Build the app for production into the `dist/` folder |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the project |
| `npx vitest run` | Run the unit test suite |

**Backend** (`backend/`):

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the API with hot reload at localhost:3001 |
| `npm run build` / `npm start` | Compile and run for production |
| `npm run seed` | Upsert built-in crops from `prisma/crops.json` |
| `npm test` | Run the Jest + Supertest suite (needs a test database) |

---

## Project Structure

```
mi-finca-PR/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # 18 models: users, farms, fields, operations, livestock…
│   │   ├── migrations/            # Versioned schema history
│   │   ├── crops.json             # Built-in crop types + schedules (seed data)
│   │   └── seed.ts
│   └── src/
│       ├── index.ts               # Express app, route mounting, /health
│       ├── routes/                # auth, farms, fields, operations,
│       │                          # recommendedOperations, livestock, harvests,
│       │                          # crops, users
│       ├── middleware/            # requireAuth / optionalAuth, errorHandler
│       ├── lib/                   # jwt, prisma, errors, validate, mailer,
│       │                          # actionTokens, farmUtils
│       └── __tests__/             # Jest + Supertest suites
│
├── frontend/
│   └── src/
│       ├── components/shared/     # layout, topNav, sideMenu, toast, dataProvider,
│       │                          # ProtectedRoute, notificationBell…
│       ├── features/              # Feature modules (domain-driven)
│       │   ├── auth/              # useAuth hooks (login/register/reset/verify)
│       │   ├── farm/              # farm CRUD UI + useFarmsApi
│       │   ├── field/             # field editor, canvas, operations view,
│       │   │                      # crop data, useFieldsApi/useOperationsApi,
│       │   │                      # canvasGeo + plantingEventManager utils
│       │   ├── map/               # Leaflet farm map + boundary drawing
│       │   ├── livestock/         # livestock section + useLivestockApi
│       │   ├── simulator/         # viability projection engine + farm models
│       │   ├── recommendations/   # rule engine behind RecommendationService
│       │   ├── inventory/         # derived crop/animal inventory
│       │   └── notifications/     # derived notification feed
│       ├── pages/                 # auth (login/register/reset/verify/change-email),
│       │                          # home, dashboard, inventory, simulator, settings
│       ├── store/                 # Zustand: farms, fields, livestock, crops,
│       │                          # auth, settings, toasts
│       └── lib/                   # api client, geo helpers
│
├── docs/                          # SRS, SDD amendment (see Documentation)
└── shared/                        # Reserved for shared types (empty)
```

### Key Architectural Decisions

**Feature-based folder structure** — code is organized by domain (farm, field, map) rather than by type. Each feature owns its components, hooks, utilities, and types.

**Hybrid state management** — farms own their field IDs (`fieldIds[]`) for safe cascade deletion, while fields live in a flat Zustand store with a `farmId` foreign key for flexible querying. This gives the safety of nesting with the query flexibility of a flat structure.

**Geographic coordinates as source of truth** — all field boundaries, row positions, and plant locations are stored as lat/lng coordinates, not canvas pixel positions. This ensures accurate rendering on the farm map regardless of zoom level or canvas size.

**Planting Event model** — crops of the same type planted on the same date in the same field are grouped into a Planting Event, which anchors the agronomic operations calendar. This allows multiple plantings of the same crop at different dates to have independent operation schedules.

**Recommendation engine as a service layer** — the rule-based engine implements a `RecommendationService` interface, allowing a future LLM-powered implementation to be swapped in without changing the UI or data models.

---

## Product Phases

### Phase 1 — Farm Management Tool (Current)
Visual farm and field mapping, crop and livestock inventory, operations logging with check-off calendar, rule-based agronomic recommendations, farm viability simulator, IoT automation hooks.

### Phase 2 — Knowledge Base (Planned)
Agricultural encyclopedia, crop preservation tutorials, companion planting guides, AI-powered recommendations via Claude API.

### Phase 3 — Agricultural Marketplace (Planned)
Public farm map with pins, product listings for crops and animal products, restaurant B2B standing orders, consumer marketplace with farm transparency records, provenance QR codes.

---

## Documentation

| Document | Description | Status |
|----------|-------------|--------|
| [SRS v1.2.1](./docs/MiFincaPR-SRS-Phase1-v1.2.1.md) | Software Requirements Specification, with per-requirement implementation status | ✅ Complete |
| SDD v1.0.0 | Software Design Document (maintained externally as PDF) | ✅ Complete |
| [SDD Amendment A](./docs/MiFincaPR-SDD-v1.0.0-Amendment-A.md) | Implementation status and deviations from SDD v1.0.0 | ✅ Complete |
| API Docs | REST API reference | 📋 Planned — endpoint inventory lives in SDD Amendment A §1.2 for now |

---

## License

Private — All rights reserved. © 2026 Angel R. Rivera.

---

> **Disclaimer:** All agronomic recommendations and livestock care schedules generated by Mi Finca PR are based on general best practices and do not constitute professional agricultural or veterinary advice. Farm viability simulator projections are estimates — actual results will vary. Consult a licensed agronomist or veterinarian before making significant changes to your farming practices.
