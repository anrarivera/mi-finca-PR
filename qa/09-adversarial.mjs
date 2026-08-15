// Adversarial round 2: XSS field name, overflow harvest quantity.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page, errors } = await launch({ state: 'state.json' })
let sawDialog = null
page.on('dialog', d => { sawDialog = d.message(); d.dismiss().catch(() => {}) })
page.on('response', async res => {
  if (res.url().includes(':3001') && res.status() >= 400) {
    let b = ''; try { b = (await res.text()).slice(0, 200) } catch {}
    console.log(`HTTP ${res.status()} ${res.request().method()} ${res.url().replace('http://localhost:3001','')} ${b}`)
  }
})
await open(page, email)

// ── XSS + long field name ────────────────────────────────────────
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await page.getByRole('button', { name: /Nuevo campo/i }).click()
await page.waitForTimeout(1000)
const evil = '<script>alert(1)</script>🌱' + 'x'.repeat(150)
await page.fill('input[placeholder*="plátanos"]', evil)
await page.getByRole('button', { name: /Polígono/i }).click()
await page.getByRole('button', { name: /Dibujar/i }).last().click()
await page.waitForTimeout(400)
for (const [x, y] of [[650, 600], [750, 600], [700, 680]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(250)
}
await page.mouse.click(650, 600)
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(2500)
const body1 = await page.evaluate(() => document.body.innerText)
log('hostile', 'script-tag + 175-char field name', sawDialog === null ? 'PASS' : 'FAIL',
  sawDialog ? `XSS DIALOG: ${sawDialog}` : (body1.includes('alert(1)') ? 'saved, renders as literal text' : 'saved/rejected without dialog'))
await shot(page, '13b-evil-field')

// ── Overflow harvest quantity on Campo QA 3 ──────────────────────
await page.goto(FRONT + '/')
await page.waitForTimeout(3000)
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
const qa3 = page.locator('div').filter({ hasText: /^Campo QA 3/ }).last()
await page.getByRole('button', { name: 'Operaciones' }).nth(2).click()
await page.waitForTimeout(1200)
const panel = page.locator('div.fixed.z-\\[2100\\]')
const cosechaRow = panel.locator('div.px-4.py-3').filter({ hasText: 'Ventana de cosecha' }).first()
if (await cosechaRow.count()) {
  await cosechaRow.getByRole('button', { name: 'Completa' }).click()
  await page.waitForTimeout(1000)
  const nums = page.locator('input[type=number]:visible')
  await nums.first().fill('999999999')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.waitForTimeout(2000)
  const body2 = await page.evaluate(() => document.body.innerText)
  const stillOpen = body2.includes('Confirmar')
  log('hostile', 'harvest qty 999,999,999', 'WARN', stillOpen ? 'modal still open — check error handling' : 'accepted — check stored value')
  await shot(page, '13b-overflow-harvest')
} else {
  log('hostile', 'overflow harvest', 'WARN', 'no cosecha row on this field')
}

console.log('ERRORS:', errors.slice(0, 5))
await context.storageState({ path: 'state.json' })
finish()
await browser.close()
