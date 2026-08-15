# QA harness (Playwright)

Drives the **running dev app** through the flows in `docs/QA-CHECKLIST.md` using a real
Chrome, clicking the UI the way a person would. Built during the first automated
checklist run (2026-08-15), which found the register bounce, the Decimal-overflow 500s,
the row-fill render loop, and friends.

## Setup

```bash
cd qa
npm install          # playwright only; uses your system Chrome (channel: 'chrome')
```

Both dev servers must be running (`backend: npm run dev` on :3001, `frontend: npm run dev`
on :5173). Scripts talk to `localhost` — never point this at production.

## Running

Scripts are numbered in dependency order — later ones assume the state earlier ones
created (an account in `account.json`, a farm with a saved boundary, fields with rows):

```bash
node 01-register-farm.mjs     # register (UI) → first-farm onboarding → create farm
node 02-boundary.mjs          # zoom in, draw + save the farm boundary
node 03-field-create.mjs      # field editor: polygon, crop, row fill, save
node 04-checkoff.mjs          # select field on map → check off a labor (Completa)
node 05-hallazgo-harvest.mjs  # record a hallazgo + a harvest from the ops panel
node 06-pages-sweep.mjs       # Cuaderno tabs, dashboard, settings
node 07-produccion-i18n.mjs   # Producción tab, sanidad CSV, EN/ES raw-key sweep
node 08-team-roles.mjs        # invite code → second account joins → operator limits
node 09-adversarial.mjs       # hostile input: XSS names, overflow quantities
node 10-phone.mjs             # 390×844 touch viewport smoke
node 11-verify-bugfixes.mjs   # regression tests for the 7 bugs fixed 2026-08-15
```

Each prints `[PASS]/[WARN]/[FAIL]` lines and saves screenshots to `shots/` — **read the
screenshots**; WARNs are usually a selector drifting after a UI change, not a bug.

## Conventions the hard way taught us

- **Session state**: scripts persist login state to `state.json`, but refresh tokens
  ROTATE on every use — each script re-saves state at the end, and `open()` in `lib.mjs`
  falls back to a UI login if the saved state has gone stale (e.g. after a crashed run).
- **Rate limiter**: auth endpoints allow 20 attempts per IP per 15 min. Crash-looping a
  script that logs in will lock you out — wait out the window.
- **Test accounts**: everything registers as `qa-<tag>-<timestamp>@example.com` with the
  shared password in `lib.mjs`. They accumulate in the dev DB; clean them with a targeted
  delete (users whose email starts with `qa-` and ends `@example.com` — cascades handle
  farms/fields), or per-account via `DELETE /api/v1/users/me` with `{ password }`.
- **Map geometry is viewport-relative**: drawing scripts click pixel coordinates, so the
  same coordinates land on different geography depending on zoom/fly-to state. Fields
  must land INSIDE the farm boundary or the save is (correctly) rejected.
- **App-specific gotchas**: the farm drawer must be opened via its left-edge tab before
  drawer buttons are clickable; the field editor defaults to RECTANGLE mode (press-drag)
  — switch to Polígono before clicking corners; the docked ops panel is the
  `div.fixed.z-[2100]` element and identical-looking buttons behind it are occluded
  decoys; invite codes must be read from `document.body.innerText` (the code abuts the
  next word, so `\b` regexes fail).

## Not yet covered (checklist sections without scripts)

Email flows (reset/verify), backup restore, corrales/livestock, walk mode, resolving
findings, editing/deleting existing fields, second-farm flows, concurrency (two tabs /
two users), offline & slow-network behavior.
