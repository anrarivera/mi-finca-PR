// Smoke A: register via UI → first-farm onboarding → boundary → save.
import { launch, shot, FRONT, uniqEmail, PASSWORD, log, finish } from './lib.mjs'
import fs from 'fs'

const { browser, context, page, errors } = await launch()
const email = uniqEmail('smoke')
fs.writeFileSync(new URL('./account.json', import.meta.url), JSON.stringify({ email }))
console.log('EMAIL', email)

// ── Register ──────────────────────────────────────────────────────
try {
  await page.goto(`${FRONT}/register`)
  await page.fill('#fullName', 'QA Smoke Tester')
  await page.fill('#email', email)
  await page.fill('#password', PASSWORD)
  await page.fill('#confirmPassword', PASSWORD)
  await page.locator('input[name=acceptTerms]').check()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.waitForURL(u => !String(u).includes('/register'), { timeout: 8000 })
  log('smoke', 'register via UI', 'PASS', page.url())
} catch (e) {
  log('smoke', 'register via UI', 'FAIL', e.message.slice(0, 200))
}
// Normalize to the map page for a deterministic starting point.
await page.waitForTimeout(3500)
await page.goto(`${FRONT}/`)
await page.waitForTimeout(1500)
await shot(page, '01-after-register')

// ── Zero-farm empty state ────────────────────────────────────────
const body = await page.textContent('body')
if (body.includes('No tienes fincas')) log('smoke', 'zero-farm empty state', 'PASS')
else log('smoke', 'zero-farm empty state', 'WARN', 'text not found — see shot')

// ── Create farm ──────────────────────────────────────────────────
try {
  await page.getByRole('button', { name: /Añadir finca/i }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '01-create-farm-modal')
  const nameInput = page.locator('input').first()
  await nameInput.fill('Finca QA')
  const inputs = page.locator('input')
  if (await inputs.count() > 1) await inputs.nth(1).fill('Gurabo, PR')
  await page.getByRole('button', { name: /Crear finca/i }).click()
  await page.waitForTimeout(2500)
  log('smoke', 'create farm', 'PASS')
} catch (e) {
  log('smoke', 'create farm', 'FAIL', e.message.slice(0, 200))
}
await shot(page, '01-after-create-farm')

// ── Onboarding card open? ────────────────────────────────────────
const body2 = await page.textContent('body')
if (body2.includes('Dibujar límite')) log('smoke', 'onboarding boundary card auto-open', 'PASS')
else log('smoke', 'onboarding boundary card auto-open', 'FAIL', 'card text not found')

// ── Draw boundary ────────────────────────────────────────────────
try {
  await page.getByRole('button', { name: /Dibujar límite/i }).click()
  await page.waitForTimeout(800)
  await shot(page, '01-drawing-mode')
  // pan-safe corner clicks in the center of the viewport
  for (const [x, y] of [[520, 280], [840, 280], [840, 560], [520, 560]]) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(350)
  }
  await shot(page, '01-boundary-points')
  const completeBtn = page.getByRole('button', { name: /Completar|Terminar/i }).first()
  await completeBtn.click()
  await page.waitForTimeout(800)
  await shot(page, '01-boundary-complete')
  log('smoke', 'draw boundary 4 corners + complete', 'PASS')
} catch (e) {
  log('smoke', 'draw boundary', 'FAIL', e.message.slice(0, 200))
  await shot(page, '01-boundary-FAIL')
}

// ── Save farm ────────────────────────────────────────────────────
try {
  await page.getByRole('button', { name: /Guardar finca/i }).click()
  await page.waitForTimeout(2000)
  const t = await page.textContent('body')
  if (t.includes('Finca guardada')) log('smoke', 'save farm + toast', 'PASS')
  else log('smoke', 'save farm + toast', 'WARN', 'no toast text seen')
} catch (e) {
  log('smoke', 'save farm', 'FAIL', e.message.slice(0, 200))
}
await shot(page, '01-farm-saved')

await context.storageState({ path: new URL('./state.json', import.meta.url).pathname.replace(/^\/(\w):/, '$1:') })
console.log('ERRORS:', errors.slice(0, 10))
finish()
await browser.close()
