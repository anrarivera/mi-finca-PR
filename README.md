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

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Component Library | shadcn/ui (Radix) |
| Routing | React Router v6 |
| Global State | Zustand |
| Server State | TanStack Query (React Query) |
| Forms | React Hook Form + Zod |
| Maps | Leaflet + React-Leaflet |
| Icons | Lucide React |

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
git clone https://github.com/your-username/mi-finca-PR.git
cd mi-finca-PR
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the development server**

```bash
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Environment Variables

This project does not currently require environment variables for the frontend development server. When the backend is added, a `.env` file will be required. A `.env.example` will be provided at that time.

> **Note:** Never commit `.env` files to version control. They are already included in `.gitignore`.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server at localhost:5173 |
| `npm run build` | Build the app for production into the `dist/` folder |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the project |

---

## Project Structure

```
mi-finca-PR/
├── public/                        # Static assets
├── src/
│   ├── components/
│   │   └── shared/                # Reusable layout components
│   │       ├── Layout.tsx         # App shell with TopNav and SideNav
│   │       ├── TopNav.tsx         # Top navigation bar
│   │       └── SideNav.tsx        # Side navigation bar
│   │
│   ├── features/                  # Feature modules (domain-driven)
│   │   ├── farm/
│   │   │   ├── components/        # Farm-level UI components
│   │   │   │   ├── CreateFarmModal.tsx
│   │   │   │   ├── EmptyFarmState.tsx
│   │   │   │   ├── FarmDrawer.tsx     # Two-level farm/field navigation drawer
│   │   │   │   ├── FarmStatBar.tsx
│   │   │   │   └── FarmMap.tsx        # Main interactive map
│   │   │   └── hooks/
│   │   │       └── useFarms.ts
│   │   │
│   │   ├── field/
│   │   │   ├── components/        # Field editor UI components
│   │   │   │   ├── FarmFieldEditor.tsx    # Persistent multi-field canvas editor
│   │   │   │   ├── FarmFieldEditorPanel.tsx
│   │   │   │   ├── FieldEditorCanvas.tsx  # SVG drawing canvas with zoom/pan
│   │   │   │   ├── PlacedField.tsx        # Field rendered on farm map
│   │   │   │   ├── RowConfigPanel.tsx     # Crop row configuration
│   │   │   │   ├── CropSelector.tsx       # Searchable crop dropdown
│   │   │   │   └── OperationsView.tsx     # Operations check-off interface
│   │   │   ├── data/
│   │   │   │   ├── cropLibrary.ts         # Pre-built crop types with emojis
│   │   │   │   └── cropSchedules.ts       # Agronomic operation templates per crop
│   │   │   ├── hooks/
│   │   │   │   ├── useFieldEditor.ts      # Canvas drawing and crop state
│   │   │   │   └── useSatelliteBackground.ts
│   │   │   ├── utils/
│   │   │   │   ├── canvasGeo.ts           # Coordinate conversion and measurement
│   │   │   │   ├── geoUtils.ts            # Point-in-polygon and lat/lng utilities
│   │   │   │   ├── operationStatus.ts     # Operation health calculation
│   │   │   │   ├── plantingEventManager.ts # Planting event creation and merging
│   │   │   │   └── rowCalculator.ts       # Crop summary computation
│   │   │   └── types.ts                   # Field, FieldRow, PlantInstance, PlantingEvent types
│   │   │
│   │   └── map/
│   │       ├── components/
│   │       │   ├── FarmMap.tsx            # Leaflet map with farm boundary drawing
│   │       │   └── DrawingPanel.tsx       # Farm boundary drawing controls
│   │       └── hooks/
│   │           └── useDrawing.ts          # Farm boundary drawing state
│   │
│   ├── pages/
│   │   └── home/
│   │       └── HomePage.tsx               # Main page — farm map or empty state
│   │
│   ├── store/                             # Zustand global state
│   │   ├── useFarmStore.ts                # Farms, active farm, favorite farm
│   │   └── useFieldStore.ts               # Fields flat store with farmId foreign key
│   │
│   ├── lib/                               # Shared utilities and config
│   │
│   ├── App.tsx                            # Route definitions
│   ├── main.tsx                           # App entry point, providers
│   └── index.css                          # Tailwind + shadcn theme variables
│
├── components.json                        # shadcn/ui configuration
├── vite.config.ts                         # Vite + Tailwind plugin config
├── tsconfig.json                          # TypeScript root config
├── tsconfig.app.json                      # TypeScript app config with path aliases
└── package.json
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
