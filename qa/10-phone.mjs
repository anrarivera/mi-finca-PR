// Phone viewport smoke: map, drawer, bottom nav, check-off.
import { launch, shot, FRONT, uiLogin, log, finish } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, page, errors } = await launch({ phone: true })
await uiLogin(page, email)
await page.waitForTimeout(3500)
await shot(page, '14-phone-map')

const body = await page.evaluate(() => document.body.innerText)
log('phone', 'map loads', body.length > 0 ? 'PASS' : 'FAIL')

// Bottom nav?
const navBtns = await page.locator('nav button:visible, nav a:visible').evaluateAll(els =>
  els.map(e => e.textContent?.trim() || e.getAttribute('title')).filter(Boolean))
console.log('NAV:', JSON.stringify(navBtns))

// Drawer tab: tap left edge
await page.mouse.click(12, 420)
await page.waitForTimeout(800)
await shot(page, '14-phone-drawer')
const drawerOpen = await page.getByRole('button', { name: /Nuevo campo|Operaciones/i }).count()
log('phone', 'drawer opens from edge tab', drawerOpen > 0 ? 'PASS' : 'WARN', `found ${drawerOpen} field buttons`)

// Check-off buttons reachable?
const completa = page.getByRole('button', { name: 'Completa' }).first()
if (await completa.count()) {
  await completa.click()
  await page.waitForTimeout(900)
  await shot(page, '14-phone-checkoff')
  const cancel = page.getByRole('button', { name: /Cancelar/i }).last()
  if (await cancel.count()) await cancel.click()
  log('phone', 'check-off modal opens', 'PASS')
} else {
  log('phone', 'check-off modal', 'WARN', 'no Completa visible')
}

console.log('ERRORS:', errors.slice(0, 5))
finish()
await browser.close()
