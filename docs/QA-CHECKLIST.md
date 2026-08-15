# Mi Finca PR — QA Checklist

Three ways to use this document:

- **Smoke pass (§1, ~15 min)** — before every deploy. If anything here fails, do not ship.
- **Full regression (§2–§17)** — before a release with many changes, or monthly. Work through every box.
- **Adversarial annex (§18)** — this is where NEW bugs live. Pick a handful of items each session and try honestly to break the app. Add every bug you find as a new checklist line so it becomes a permanent regression check.

Conventions: test on **desktop Chrome + a real phone** (the map editor, drawers, and modals behave differently on coarse pointers). Keep two throwaway accounts handy (one owner, one to invite as operator). Lines marked **[2nd]** are "second-time" flows — the first walk of second-farm flows found ~8 bugs, so second member / second corral / delete-then-recreate deserve the same suspicion.

---

## §1 Pre-deploy smoke pass

- [ ] Register a fresh account (or login), land on the map
- [ ] Create a farm → onboarding card appears → draw boundary → save → "Finca guardada"
- [ ] Create a field: polygon, name it, fill rows, save → field appears on map
- [ ] Open the field's operations, check off one labor (Completa)
- [ ] Record a harvest
- [ ] Create a hallazgo and resolve it
- [ ] Cuaderno de campo: all 5 tabs open without errors; one CSV export downloads
- [ ] Panel de control: tiles show sane numbers
- [ ] Invite code: generate one, join with the second account, operator sees the farm
- [ ] Switch language to English and back — no raw i18n keys anywhere you passed
- [ ] Phone: open the app, pan the map, open the farm drawer, check off a labor

---

## §2 Auth & account lifecycle

- [ ] Register: valid email + password → account created, correct landing
- [ ] Register with signup gate in invite mode: without code → blocked; with valid code → in; with expired/used-up code → clear error
- [ ] Register with an already-used email → clear error, no account clobbered
- [ ] Password rules enforced (max 128, minimum rules) with readable messages
- [ ] Verify email flow: link works, expired/garbage token shows a sane page
- [ ] Login: correct creds → in; wrong password → error (no lockout surprise)
- [ ] Rate limiting: ~20 rapid failed logins → throttled with a clear message, recovers later
- [ ] Logout → protected pages redirect to /login
- [ ] Session refresh: leave the app open >15 min, then act — request succeeds silently (no logout, no error)
- [ ] Refresh cookie expiry: after it's gone, next action lands you at login cleanly (no infinite spinner)
- [ ] Forgot password: email arrives, reset works, old password dead, new one works
- [ ] Reset with expired/reused token → clear error
- [ ] Change email flow: confirmation to the new address, login moves to new email
- [ ] Delete account: confirm flow, data gone, email is re-registerable
- [ ] /terms and /privacy load logged-out

## §3 First-farm onboarding

- [ ] Zero farms: full-page empty state with "Añadir finca" CTA
- [ ] Create farm (name + municipio) → flows straight into boundary drawing
- [ ] First farm ever: the boundary onboarding card is OPEN (Milestone icon, "Dibujar límite de la finca")
- [ ] Panning/zooming the map does NOT close the onboarding card
- [ ] "Ahora no" dismisses; FAB reopens it
- [ ] Draw boundary: tap corners, point count updates, undo removes last, cancel discards
- [ ] Close polygon by tapping first point / Completar
- [ ] Save with <3 points → "Dibuja al menos 3 puntos" error
- [ ] Guardar finca → "Finca guardada", boundary persists after refresh
- [ ] After save: farm drawer is discoverable (tab at left edge)
- [ ] With ≥1 farm existing, the boundary card does NOT auto-open on later visits

## §4 Farm management

- [ ] Edit boundary: move points, add point, delete point, save updates acreage
- [ ] Unsaved boundary + switch farm → confirmation before discard
- [ ] Clear & redraw works
- [ ] Delete farm: confirm dialog names the farm; farm AND its fields gone (check Cuaderno too)
- [ ] **[2nd]** Add a second farm → drawing starts on the NEW farm, no boundary inherited from the first
- [ ] **[2nd]** Non-active farms show centroid pins; clicking a pin switches (with confirm if dirty work)
- [ ] **[2nd]** Farm switch: fields, drawer, and drawing layer all swap to the new farm (nothing stale)
- [ ] Favorite farm: star persists; app opens flown to the favorite
- [ ] Farm drawer: farms level ↔ fields level navigation, back button, field cards correct
- [ ] Exactly 1 farm → drawer auto-navigates to fields level
- [ ] Overdue / due-soon badges on drawer cards match reality
- [ ] "¿Tienes un código? Únete a una finca" flow from the drawer

## §5 Field creation & editing

- [ ] "Gestionar campos" before boundary saved → "Primero guarda el límite..." alert
- [ ] Polygon field: draw, close, name required to save
- [ ] Rectangle field: press-drag draws (try with mouse AND finger — map must not pan)
- [ ] Field outside farm boundary → save rejected with the Spanish validation error
- [ ] Rellenar con hileras: spacing, margen, pasillos produce expected counts
- [ ] Move rows a lo largo / a lo ancho (arrows follow ROW orientation, not compass)
- [ ] Moving rows only CLIPS plants (nothing regrows on the opposite side)
- [ ] Rotate ⟲/⟳ (right button turns right), numeric degrees, Restablecer posición
- [ ] Row selector drawer: tri-state row checkboxes, expand to per-plant, "Plantas sueltas"
- [ ] Map→drawer: click row line / plant dot on map toggles it in the open drawer (row expands, plant checks)
- [ ] Drawer→map: checking rows/plants paints them amber on the map
- [ ] While editing field 1, double-click field 2 → editor switches (with unsaved-work confirm)
- [ ] Delete rows/plants → removal reason dialog → logged in the Cuaderno as an operation
- [ ] Cancel with unsaved work → confirm; Esc backs out one level at a time
- [ ] Save: "Campo guardado/actualizado"; field + rows + plants persist after refresh
- [ ] Save failure (stop the backend, then save) → error toast "tus cambios siguen en el editor", editor stays open, work intact; restart backend, save again succeeds
- [ ] Big field (~20+ acres, 10k plants): saves OK; zoomed out shows rows only; plant dots fade in when zooming close; map stays smooth
- [ ] Edit an existing field: everything above works on re-edit
- [ ] Delete field from drawer → "Campo eliminado", gone everywhere

## §6 Corrales (livestock)

- [ ] Create a livestock field (corral) — drawn like a field, kind livestock
- [ ] Add a herd: animal type, head count; corral label shows emoji + count on map
- [ ] Assign / rotate herd to a different corral; map labels update
- [ ] Log producción (eggs, milk); appears in the unified ledger
- [ ] Log meat → herd head count DECREMENTS by the amount
- [ ] **[2nd]** Second herd in same corral; second corral; move herds between them
- [ ] Animales tab in Cuaderno shows the history

## §7 Operations / Labores

- [ ] New planting generates recommended operations from the crop's template dates
- [ ] Labores panel (Panel de control): shows today's/pending labores, checkable inline
- [ ] Field card quick check-off works (modal over map, map still pannable behind it)
- [ ] Completa: whole scope logged, disappears from pending
- [ ] Parcial: scope selector — rows, per-plant, counts ("N de M plantas"); map click toggles work here too
- [ ] Omitir: skipped with reason, recorded distinctly from completed
- [ ] Correct/edit a logged operation after the fact
- [ ] Overdue operations flagged (dates in the past), due-soon respects lead-days setting
- [ ] Custom crop: create with its own operation template → operations generate from it
- [ ] Operation notes persist and show in the Cuaderno

## §8 Harvests

- [ ] Record harvest: scope (field/rows/plants), quantity + unit, date
- [ ] Harvest reflected: cosechas tab, dashboard, plant status colors on map (red = harvested)
- [ ] Revenue amount on harvest (if entered) totals correctly
- [ ] **[2nd]** Second harvest on the same planting; harvest after partial harvest

## §9 Scouting / Sanidad

- [ ] Create hallazgo: severity levels show yellow / amber / red (not a red ramp)
- [ ] Scope a finding to rows/plants; map paints affected rows/plants by severity
- [ ] Field health traffic light on the zoomed-out map reflects worst open finding
- [ ] Walk mode: step through plants, log findings as you go
- [ ] Resolve a finding → paint clears, moves to history
- [ ] Sanidad tab: recurrence view, full history, certifier CSV exports
- [ ] Treatment recorded against a finding shows in the Cuaderno

## §10 Cuaderno de campo (5 tabs)

- [ ] Siembras: grid rows match reality; every sort column works both directions
- [ ] Siembras on phone: cards render instead of the 9-column table
- [ ] Labores: history filtered/complete; checkable where pending
- [ ] Cosechas: log with amounts and dates
- [ ] Sanidad: findings + treatments
- [ ] Animales: herds and producción
- [ ] Every tab has a sane EMPTY state (brand-new farm)
- [ ] CSV exports open correctly in Excel (accents, dates, commas in names)

## §11 Panel de control

- [ ] Tiles: fincas / campos / área total / plantas / animales all correct (cross-check by hand once)
- [ ] Today's labores listed and checkable
- [ ] Notification bell: unread count, mark-read, links land on the right page

## §12 Team & roles

- [ ] Add member by email of an existing account → appears with chosen role
- [ ] Add email with no account → clear message (not a silent failure)
- [ ] Invite code: generate operator + admin codes; expiry shows (7 days); copy button
- [ ] Join by code at registration AND from "Unirme a una finca" — correct role granted
- [ ] Revoke a code → joining with it fails cleanly
- [ ] **[2nd]** Same code used by a second person (multi-use) — works until revoked/expired
- [ ] Change a member's role; remove a member (their access dies on next action)
- [ ] Leave farm (non-owner) → farm gone from their drawer
- [ ] OPERATOR account sweep: can log labores/hallazgos/cosechas/producción; can NOT see boundary FAB, field editor, team management, or farm delete — check every page
- [ ] ADMIN: everything except owner-only actions (delete farm, owner role changes)
- [ ] Two accounts on the same farm simultaneously: A logs an operation, B sees it after refetch (~5 min or reload)

## §13 Settings

- [ ] Language toggle es ↔ en: whole UI switches, persists after reload, digest emails follow
- [ ] Notifications: in-app toggle, email digest on/off, frequency (novedades/semanal), overdue, due-soon, harvest, lead days — each persists (they sync to the server; check after reload)
- [ ] Export/backup downloads a JSON
- [ ] Restore: valid backup restores; invalid JSON → error toast; newer-version file → rejected with message
- [ ] Clear data: double-confirm, actually clears
- [ ] Account section: change email, password change, delete account reachable

## §14 Emails (Resend)

- [ ] Daily digest: arrives on schedule, groups read correctly, respects language + frequency + toggles
- [ ] Digest for a user with nothing pending: not sent (or sensible empty content — verify which is intended)
- [ ] Password reset, verify email, change email: all arrive, links work, not in spam (check SPF/DKIM once on prod domain)

## §15 PWA & mobile

- [ ] Install to home screen: icon, name, splash correct; opens standalone
- [ ] Map editor on phone: toolbar at bottom, targets big enough, rectangle-drag doesn't fight the pan
- [ ] Drawer on phone: toggle tab reachable, hidden while open
- [ ] Modals on phone: fit viewport, keyboard doesn't cover inputs
- [ ] Airplane mode: app tells you it's offline rather than silently eating writes (verify intended behavior)
- [ ] Slow connection (DevTools 3G throttle): first load acceptable, saves show progress not freeze

## §16 Cross-cutting guards

- [ ] Every chrome exit (side rail, bottom tabs, logo, settings, bell) while editing → unsaved-work confirm
- [ ] Browser refresh/close while dirty → beforeunload prompt
- [ ] Overlays opened from inside the farm drawer render full-size (portal, not clamped to 300px)
- [ ] Toasts appear above whatever is open, and errors persist long enough to read

## §17 i18n sweep

- [ ] Full walk of every page in English: no raw keys (`farm.drawer.xyz`), no leftover Spanish
- [ ] Full walk in Spanish: no leftover English
- [ ] Pluralization: 1 finca/2 fincas, 1 punto/2 puntos, count-based strings
- [ ] Dates render in the active locale everywhere

---

## §18 Adversarial annex — try to break it

Do a few of these every session. Found a bug? Fix it, then add a line to the section above where it belongs.

**Interruption**
- [ ] Refresh mid-field-edit, mid-boundary-draw, mid-modal — no corrupt state after reload
- [ ] Kill the network mid-save (DevTools offline) — error surfaces, work not lost, retry succeeds
- [ ] Let the session go stale (>15 min idle) then immediately save — silent refresh, no lost work
- [ ] Press Back at every step of every flow
- [ ] Close the create-farm modal halfway through and reopen

**Concurrency**
- [ ] Two tabs, same account: edit the same field in both, save both — last-write behavior is sane, no crash
- [ ] Two accounts, same farm: delete a field in A while B has its operations modal open
- [ ] Delete the farm in tab A while tab B is drawing a field in it

**Hostile input**
- [ ] Names: 200+ chars, emoji, `<script>alert(1)</script>`, only spaces, leading/trailing spaces
- [ ] Numbers: 0, negative, 999999999, decimals where ints expected, `1e10`, pasted text
- [ ] Harvest more plants than exist; head-count meat decrement below zero
- [ ] Spacing/margin values that produce 0 plants or absurd counts (0.1 ft spacing on 30 acres — does the UI warn before generating 1M plants?)
- [ ] Dates: planting date in the future, harvest before planting, operations on Feb 29

**Sequence abuse**
- [ ] Do everything in the WRONG order: try to add fields before boundary, harvest before planting, resolve a finding twice
- [ ] Rapid double-clicks on every submit button (double-charge / duplicate records?)
- [ ] Create → delete → recreate with the same name (farm, field, corral, member)
- [ ] **[2nd]** Every flow that worked once: do it a second time, then a third

**Scale**
- [ ] 30-acre field, 20k+ plants: save, reload, edit, operate, harvest
- [ ] Farm with 15 fields; account with 5 farms
- [ ] 100 operations logged on one field — Cuaderno and dashboard still fast
- [ ] Field with 1 plant; farm with 0 fields; row with 1 plant

**Environment**
- [ ] Phone rotated to landscape mid-edit
- [ ] Browser zoom 150% / OS text scaling
- [ ] Timezone edge: log an operation at ~11:55 PM (does it land on the right date?)
- [ ] Sunday-night / month-boundary date displays
