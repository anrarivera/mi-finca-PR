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
- Livestock management (chickens, rabbits, goats, cows, bees)
- Operations logging with agronomic calendar check-off flow
- Rule-based recommendation engine (AI-ready interface)
- Farm viability simulator with pre-built farm model templates
- IoT-ready irrigation automation via webhook integration
- Personal weather station data ingestion
- Multi-farm support with favorite farm navigation

---

## Tech Stack

**Frontend** (`frontend/`)

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Component Library | shadcn/ui (Radix) |
| Routing | React Router v7 |
| Global State | Zustand (persisted to localStorage — offline-first) |
| Server State | TanStack Query (React Query) |
| Forms | React Hook Form + Zod |
| Maps | Leaflet + React-Leaflet |
| Icons | Lucide React |
| Tests | Vitest |

**Backend** (`backend/`)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + Express 5 + TypeScript |
| Database | PostgreSQL + Prisma 6 |
| Auth | JWT (15 min access token + rotating 30-day refresh token in an HttpOnly cookie) |
| Validation | Zod |
| Security | helmet, CORS, bcrypt (cost 12), express-rate-limit |

---

## Prerequisites

Ensure you have the following installed before running the project:

- **Node.js** v20.17.0 or higher — [nodejs.org](https://nodejs.org)
- **npm** v11 or higher (comes with Node)

Verify your versions:

```bash
node --version   # should be v20.17.0+
npm --version    # should be 11+
```

---

## Installation

1. **Clone the repository**
```bash
git clone https://github.com/anrarivera/mi-finca-PR.git
cd mi-finca-PR
```

2. **Frontend** — this is all you need for the app itself (it runs offline-first with localStorage):
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

3. **Backend (optional)** — enables accounts (register/login). Requires PostgreSQL:
```bash
cd backend
npm install
cp .env.example .env    # then edit DATABASE_URL and the JWT secrets
npx prisma migrate dev  # create the database schema
npm run dev             # starts http://localhost:3001
```

---

## Environment Variables

- **Backend** — copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`. The server validates its configuration at startup and tells you exactly what is missing.
- **Frontend** — optional; copy `frontend/.env.example` to `frontend/.env` if your API is not at `http://localhost:3001`.

> **Note:** Never commit `.env` files to version control. They are already included in `.gitignore`.

---

## Available Scripts

From the repository root:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the frontend dev server at localhost:5173 |
| `npm run backend` | Start the backend dev server at localhost:3001 |
| `npm run build` | Production build of frontend and backend |
| `npm run lint` | Run ESLint across the frontend |
| `npm test` | Run the frontend unit tests (Vitest) |

Continuous integration runs lint, tests, and both builds on every pull request (`.github/workflows/ci.yml`).

---

## API Overview

All endpoints are prefixed with `/api/v1` and return `{ success, data | error }`. Protected routes take a `Authorization: Bearer <accessToken>` header.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Farms | `GET/POST /farms`, `PUT/DELETE /farms/:id` |
| Fields | `GET/POST /farms/:id/fields`, `PUT/DELETE /fields/:id` |
| Livestock | `GET/POST /livestock`, `PUT/DELETE /livestock/:id` |

Deletes are soft (`deletedAt`), matching the Prisma schema. The frontend currently persists working data locally (offline-first) and uses the API for accounts; syncing farm data to the cloud is the next milestone.

---

## Project Structure

```
mi-finca-PR/
├── frontend/
│   └── src/
│       ├── components/shared/     # Layout, TopNav, SideMenu, Toast, ConfirmDialog, ErrorBoundary
│       ├── features/              # Feature modules (domain-driven)
│       │   ├── farm/              # CreateFarmModal, EmptyFarmState, FarmDrawer
│       │   ├── field/             # Field editor: canvas, panels, crop data, planting events
│       │   ├── map/               # Leaflet map + farm boundary drawing
│       │   ├── livestock/         # Animal library, livestock management UI
│       │   └── recommendations/   # RecommendationService + rule-based engine
│       ├── pages/
│       │   ├── home/              # Farm map or empty state
│       │   ├── dashboard/         # Stats, labores, recomendaciones, animales
│       │   ├── settings/          # Backup export/import, app info
│       │   └── auth/              # Login / register
│       ├── store/                 # Zustand stores (farms, fields, livestock, auth, toasts)
│       └── lib/                   # api client, geo helpers
│
├── backend/
│   ├── prisma/                    # PostgreSQL schema + migrations (14 models)
│   └── src/
│       ├── lib/                   # env validation, jwt, prisma, errors, zod helper
│       ├── middleware/            # requireAuth, errorHandler
│       └── routes/                # auth, farms, fields, livestock
│
└── .github/workflows/ci.yml       # Lint + tests + builds on every PR
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
| [SRS v1.2.0](./docs/MiFincaPR-SRS-Phase1-v1.2.0.docx) | Software Requirements Specification | ✅ Complete |
| SDD | Software Design Document | 📋 Planned |
| API Docs | REST API reference | 📋 Planned (when backend is built) |

---

## License

Private — All rights reserved. © 2026 Angel R. Rivera.

---

> **Disclaimer:** All agronomic recommendations and livestock care schedules generated by Mi Finca PR are based on general best practices and do not constitute professional agricultural or veterinary advice. Farm viability simulator projections are estimates — actual results will vary. Consult a licensed agronomist or veterinarian before making significant changes to your farming practices.
