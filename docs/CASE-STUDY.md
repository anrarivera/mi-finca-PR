# Mi Finca PR — Engineering Case Study

A solo-built, bilingual farm-management PWA for small and mid-size farms in Puerto
Rico: satellite-imagery field mapping down to individual plants, an agronomic
operations calendar, pest scouting, livestock, harvest and revenue records — with
compliance-grade record keeping (the *cuaderno de campo*) as the product's core bet.

This document is the narrative the README doesn't tell: why it's built the way it
is, the hard problems, how quality was pursued, and what I'd do next. Written for
engineers evaluating the work, not for users.

---

## The problem, and who it's for

Puerto Rican farm operations that want agricultural certifications or program
compliance must keep dated records of plantings, labores (fieldwork), pesticide
findings/treatments, and harvests. Today that's paper notebooks and memory.
Existing farm software is built for thousand-acre monoculture operations in
English; a 15-acre finca growing plátanos, café, and gallinas in Utuado is not
its user.

Mi Finca PR's wedge: make the record-keeping a *by-product* of a tool farmers
actually want to use daily (a live map of their farm with a "what needs doing
today" panel), then generate the compliance paperwork from records that accumulated
naturally. Spanish-first, phone-first, feet-and-acres (PR uses US units), with the
island's 78 municipios, crops, and pests built in as domain data.

The product is validated with real beta testers — several design reversals below
came directly from watching them fail.

## Architecture

**A deliberately boring shape: React SPA + Express monolith + Postgres.**

- **Frontend:** React 19 + TypeScript + Vite, Tailwind, Leaflet for mapping,
  Zustand for domain state, TanStack Query for server state, react-i18next
  (complete es/en coverage).
- **Backend:** Express 5 + Prisma 6 + PostgreSQL. JWT auth: 15-minute access
  tokens held in memory, 30-day rotating refresh tokens in HttpOnly
  SameSite=Strict cookies. Role system (owner/admin/operator) enforced
  server-side per route; the client only *hides* what the server would reject.
- **Why a monolith:** single-region user base, one developer, Prisma's
  connection pooling fits a warm long-lived process, and one deploy/one log
  stream matters when the whole ops team is one person. Serverless was
  considered and rejected on cold starts + Prisma connection churn; the
  documented escape hatch is a second worker process, not a rewrite.

**Domain model worth noting:** crops of one type planted on one date form a
*Planting Event*, which anchors a generated operations calendar (from per-crop
schedule templates). Completing a harvest-type operation mirrors automatically
into yield records with optional revenue. Livestock reuses the field abstraction
(a corral is a field of kind `livestock`), so herds, production, and even
meat-decrements-the-headcount flow through the same unified ledger.

## The hard problems

**1. Field geometry on a real map.** Fields are polygons on satellite imagery;
rows of crops must fill them the way a farmer would plant. That meant a small
computational-geometry library (unit-tested, 115 tests): a feet-plane projection,
minimum-area bounding rectangles via convex hull + rotating calipers to find a
field's natural orientation, row generation with margins and corridors, and
contour rows that follow the boundary. The subtle part came from a user
correction: when rows are moved or rotated, plants must *only clip off* at the
boundary — never regrow on the opposite side — or half-field multi-crop layouts
(cane north, plátanos east, oranges west) become inexpressible. That "clip-only"
invariant is encoded in tests.

**2. Rendering 10,000+ plants without melting.** A tester built an 18-acre field
with 10,594 plants; every plant was a React component owning an SVG node. The fix
is level-of-detail rendering: plant dots draw only past a zoom threshold (below
it they're sub-pixel noise — row lines carry the picture), only inside the padded
viewport, and never more than a hard cap at once — making field size irrelevant
to render cost. Leaflet's canvas renderer was evaluated and *rejected* with a
documented reason: drag handlers attach to per-marker DOM elements that canvas
rendering doesn't produce, and mixed SVG/canvas panes steal each other's clicks.

**3. The payload diet.** The same tester's field couldn't save: Express's default
100 KB body limit. Raising it was the unblock; the real work was discovering the
field serializer shipped every plant **three times** (raw Prisma relations
spread into the response beside their nested shapes) and cutting coordinates to
6 decimals (~11 cm — full doubles are noise for plants). Downloads dropped
roughly 5–6×; unchanged refetches now answer as empty 304s via ETag
revalidation with `Cache-Control: private, no-cache`.

**4. Onboarding against real confusion.** Testers drew a field when asked for a
farm boundary, drew boundaries the size of half the island (which overflowed a
`Decimal(10,4)` column into a 500), and got lost after saving. The response was
layered: fly the map to the farmer's municipio the moment the farm is created
(78-town coordinate table), an onboarding card that survives map panning,
a friendly size validation, a follow-up "create your first field" card, and a
row-fill panel reordered crop-first with defaults that can never generate a
monster. Every one of these traces to a specific observed failure.

## The quality story (told honestly)

Testing arrived late and then arrived seriously. The sequence:

1. **A QA checklist built from the code** (`docs/QA-CHECKLIST.md`): a 15-minute
   pre-deploy smoke tier, a full per-feature regression tier, and an adversarial
   annex (interruption, concurrency, hostile input, sequence abuse, scale).
   Found bugs get fixed *and promoted to permanent checklist lines*.
2. **A Playwright harness that drives the real app** (`qa/`): registration
   through drawn boundaries, row fill, check-offs, findings, harvests, invite
   codes, role sweeps, two-tab concurrency, backup/restore round-trips, and a
   phone viewport — plus persona walks (new farmer, invited worker on a phone,
   returning owner) that judge screens with fresh eyes rather than assertions.
3. **The first systematic run found 8 real bugs**, including: every new
   registration bounced back to the login screen after 2.5 s (a leftover
   `setTimeout(navigate)`), numeric-overflow 500s, an infinite render loop in
   the row-fill preview, locale-wrong number formatting ("130,611 ac" for
   130.611 acres), and — worst for a records product — **backups taken while
   any labor was pending failed their own restore** (`.optional()` schema
   fields rejecting the server's explicit nulls). All fixed, each with a
   regression test in the harness.

Failure handling follows one rule learned the hard way: **a failed save must
never cost the user their input.** The field editor stays open with work intact
on error; check-off modals await the mutation and close only on success; backend
fallback errors are mapped to localized messages client-side.

The backend API suite (104 Jest + Supertest tests) has its own safety story:
an early version wiped whatever database it was pointed at — a landmine that
earned a standing "never run this" rule. The fix made the dangerous thing
*impossible* rather than merely avoided: setup refuses to run unless a
dedicated `TEST_DATABASE_URL` is set, differs from the dev URL, and names a
database containing "test"; the redirect happens in every Jest worker before
any database client can be constructed. Verified by counting dev-database rows
before and after a full run. CI runs everything on every push: frontend build +
lint + unit tests, backend typecheck, and the API suite against a throwaway
Postgres service container.

## Security posture

Rotating refresh tokens (single-use, HttpOnly, SameSite=Strict), rate limiting
on auth endpoints keyed by real client IP behind the proxy, invite-gated signup
mode, per-farm role enforcement on every route, hashed multi-use invite codes
with expiry and revocation, password confirmation for account deletion, Helmet
CSP tuned for the tile providers, name/quantity/boundary validation server-side
(client `maxLength` is treated as convenience, never as the guarantee), and
React's escaping verified against script-tag input by the adversarial suite.

## Known debt, stated plainly

- **No shared API contract** — response shapes are hand-typed on both sides;
  serializers are ad-hoc. A drift here caused the triple-payload bug. Zod-based
  shared schemas (or OpenAPI generation) is the planned fix.
- **Derived-plants storage** — plants are stored as individual rows though they
  are largely derivable from row spec + spacing + removals. Fine at current
  scale; the redesign is specced for when multi-hundred-acre farms are normal.
- **Not yet deployed** — gated beta deploy (Railway) is the next milestone,
  pending business formalities. The deployment runbook exists.

## What this project demonstrates

Requirements engineering (versioned SRS/SDD with amendments), product iteration
against real user failures, computational geometry with a tested invariant,
performance engineering (LOD, payload, caching) driven by measurements on real
data, a defense-in-depth approach to validation and auth, full bilingual i18n,
and a testing practice that — once established — found and fixed more real bugs
in a week than the previous month of feature work had shipped.
