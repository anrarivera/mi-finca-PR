// Verify bug fixes 1, 2, 3, 5 against the live app.
import { launch, shot, FRONT, uniqEmail, PASSWORD, uiLogin, log, finish } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, page } = await launch()

// ── Fix 1: register stays in the app ─────────────────────────────
const em = uniqEmail('fix1')
await page.goto(`${FRONT}/register`)
await page.fill('#fullName', 'Fix Verify')
await page.fill('#email', em)
await page.fill('#password', PASSWORD)
await page.fill('#confirmPassword', PASSWORD)
await page.locator('input[name=acceptTerms]').check()
await page.getByRole('button', { name: 'Crear cuenta' }).click()
await page.waitForTimeout(4500)
log('fix1', 'no /login bounce after register', page.url().includes('/login') ? 'FAIL' : 'PASS', page.url())

// ── Fix 2: island-size boundary → friendly Spanish validation ────
await page.getByRole('button', { name: /Añadir finca/i }).first().click()
await page.waitForTimeout(600)
const inputs = page.locator('.fixed input:visible, div[role=dialog] input:visible')
await inputs.first().fill('Finca Gigante')
await inputs.nth(1).fill('Utuado, PR')
await page.getByRole('button', { name: /Crear finca/i }).click()
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /Dibujar límite/i }).click()
await page.waitForTimeout(700)
for (const [x, y] of [[520, 280], [840, 280], [840, 560], [520, 560]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(300)
}
const comp = page.getByRole('button', { name: /Completar|Terminar/i })
if (await comp.count()) { await comp.first().click(); await page.waitForTimeout(500) }
await page.getByRole('button', { name: /Guardar finca/i }).click()
await page.waitForTimeout(2000)
const b2 = await page.evaluate(() => document.body.innerText)
log('fix2', 'giant boundary rejected with Spanish message',
  b2.includes('demasiado grande') ? 'PASS' : (b2.includes('unexpected error') ? 'FAIL' : 'WARN'),
  b2.includes('demasiado grande') ? 'validation toast shown' : 'check shot')
await shot(page, '15-giant-boundary')

// ── Fix 3: overflow harvest keeps modal open, Spanish error ──────
await uiLogin(page, email)
await page.waitForTimeout(3500)
await page.mouse.click(700, 420)
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Operaciones' }).nth(2).click()
await page.waitForTimeout(1200)
const panel = page.locator('div.fixed.z-\\[2100\\]')
const cosechaRow = panel.locator('div.px-4.py-3').filter({ hasText: 'Ventana de cosecha' }).first()
await cosechaRow.getByRole('button', { name: 'Completa' }).click()
await page.waitForTimeout(1000)
await page.locator('input[type=number]:visible').first().fill('999999999')
await page.getByRole('button', { name: 'Confirmar' }).click()
await page.waitForTimeout(2000)
const b3 = await page.evaluate(() => document.body.innerText)
const modalOpen = (await page.getByRole('button', { name: 'Confirmar' }).count()) > 0
log('fix3', 'overflow qty: Spanish validation toast', b3.includes('demasiado grande') ? 'PASS' : 'WARN')
log('fix3', 'overflow qty: modal stays open with input', modalOpen ? 'PASS' : 'FAIL')
await shot(page, '15-overflow-harvest')
// retry with a sane value proves the retry path
if (modalOpen) {
  await page.locator('input[type=number]:visible').first().fill('75')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.waitForTimeout(1800)
  const b4 = await page.evaluate(() => document.body.innerText)
  log('fix3', 'retry with sane qty succeeds', (await page.getByRole('button', { name: 'Confirmar' }).count()) === 0 ? 'PASS' : 'WARN')
}

// ── Fix 5: dashboard area grouped US-style ───────────────────────
await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
const b5 = await page.evaluate(() => document.body.innerText)
log('fix5', 'dashboard area shows grouped number', /1,8\d\d/.test(b5) ? 'PASS' : 'WARN', (b5.match(/[\d,.]+\s*ac/) || [])[0] ?? '?')
await shot(page, '15-dashboard')

finish()
await browser.close()
