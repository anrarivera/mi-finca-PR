// Persona 3: the returning owner. Seed a backdated planting (overdue
// labores), then walk in asking: what's overdue? what did my worker do?
// what have I harvested?
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
await open(page, email)

// ── Seed: a café field planted June 1st (labores now overdue) ────
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await page.getByRole('button', { name: /Nuevo campo/i }).click()
await page.waitForTimeout(1000)
await page.fill('input[placeholder*="plátanos"]', 'Café Viejo')
await page.getByRole('button', { name: /Polígono/i }).click()
await page.getByRole('button', { name: /Dibujar/i }).last().click()
await page.waitForTimeout(400)
for (const [x, y] of [[580, 560], [700, 560], [700, 650], [580, 650]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(250)
}
await page.mouse.click(580, 560)
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Rellenar con hileras/i }).click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: /Seleccionar cultivo/i }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Café/ }).first().click()
await page.waitForTimeout(400)
await page.locator('input[type=number]:visible').first().fill('3')
await page.locator('input[type=date]:visible').first().fill('2026-06-01')
await page.getByRole('button', { name: /Crear \d+ hileras/i }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(2500)
console.log('seeded café field (planted 2026-06-01)')

// ── The walk: "I've been away a week. What needs me?" ────────────
await page.goto(FRONT + '/')
await page.waitForTimeout(3000)
await shot(page, 'p3-01-map-landing')

// The dashboard is where an owner should get answers
await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
await shot(page, 'p3-02-dashboard')
const dash = await page.evaluate(() => document.body.innerText)
const overdue = dash.match(/(\d+)\s*Vencidas/)?.[1]
log('p3', 'dashboard shows overdue count', overdue && overdue !== '0' ? 'PASS' : 'WARN', `Vencidas=${overdue}`)

// Who did what: Cuaderno → Labores
await page.goto(FRONT + '/inventory')
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Labores' }).click()
await page.waitForTimeout(1500)
await shot(page, 'p3-03-labores-log')
const lab = await page.evaluate(() => document.body.innerText)
log('p3', 'labores log shows the worker\'s entry', /Luis|Peón|realizada|Completada/i.test(lab) ? 'PASS' : 'WARN', 'checking attribution')

// What did I harvest: Producción
await page.getByRole('button', { name: 'Producción' }).click()
await page.waitForTimeout(1500)
await shot(page, 'p3-04-produccion')

// Sanidad: the worker reported a finding — do I see it?
await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2000)
const dash2 = await page.evaluate(() => document.body.innerText)
log('p3', 'worker\'s finding visible to owner', /hallazgo activo/.test(dash2) ? 'PASS' : 'WARN')

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
