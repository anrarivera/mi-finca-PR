// Persona 1: brand-new farmer, desktop, no help. Screenshot every moment
// where a novice has to make a decision — the shots get judged by hand.
import { launch, shot, FRONT, uniqEmail, PASSWORD, log, finish } from './lib.mjs'
import fs from 'fs'

const { browser, context, page } = await launch()
const email = uniqEmail('persona')
fs.writeFileSync(new URL('./account.json', import.meta.url), JSON.stringify({ email }))
console.log('EMAIL', email)

// Moment 1: the register page itself
await page.goto(`${FRONT}/register`)
await page.waitForTimeout(1200)
await shot(page, 'p1-01-register')
await page.fill('#fullName', 'Doña Carmen Rosario')
await page.fill('#email', email)
await page.fill('#password', PASSWORD)
await page.fill('#confirmPassword', PASSWORD)
await page.locator('input[name=acceptTerms]').check()
await page.getByRole('button', { name: 'Crear cuenta' }).click()
await page.waitForTimeout(3500)
await shot(page, 'p1-02-first-landing')

// Moment 2: create the farm
await page.getByRole('button', { name: /Añadir finca/i }).first().click()
await page.waitForTimeout(600)
await shot(page, 'p1-03-create-modal')
const inputs = page.locator('.fixed input:visible, div[role=dialog] input:visible')
await inputs.first().fill('Finca Carmen')
await inputs.nth(1).fill('Utuado, PR')
await page.getByRole('button', { name: /Crear finca/i }).click()
await page.waitForTimeout(2500)
await shot(page, 'p1-04-after-create')

// Moment 3: find my land (pan/zoom while the card is open)
await page.mouse.move(680, 420)
for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(400) }
await shot(page, 'p1-05-zoomed-card-still-open')

// Moment 4: draw the boundary
await page.getByRole('button', { name: /Dibujar límite/i }).click()
await page.waitForTimeout(700)
await shot(page, 'p1-06-drawing-mode')
for (const [x, y] of [[540, 300], [820, 300], [820, 540], [540, 540]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(300)
}
await shot(page, 'p1-07-four-corners')
const comp = page.getByRole('button', { name: /Completar|Terminar/i })
if (await comp.count()) { await comp.first().click(); await page.waitForTimeout(500) }
await shot(page, 'p1-08-completed')
await page.getByRole('button', { name: /Guardar finca/i }).click()
await page.waitForTimeout(2000)

// Moment 5: THE critical moment — boundary saved. Now what?
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
await shot(page, 'p1-09-now-what')

// Moment 6: the field editor, first sight
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await shot(page, 'p1-10-drawer-open')
await page.getByRole('button', { name: /Nuevo campo/i }).click()
await page.waitForTimeout(1000)
await shot(page, 'p1-11-editor-first-open')

// Moment 7: the row-fill panel with all its numbers
await page.fill('input[placeholder*="plátanos"]', 'Los Guineos')
await page.getByRole('button', { name: /Polígono/i }).click()
await page.getByRole('button', { name: /Dibujar/i }).last().click()
await page.waitForTimeout(400)
for (const [x, y] of [[600, 350], [800, 350], [800, 500], [600, 500]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(250)
}
await page.mouse.click(600, 350)
await page.waitForTimeout(600)
await shot(page, 'p1-12-shape-done')
await page.getByRole('button', { name: /Rellenar con hileras/i }).click()
await page.waitForTimeout(700)
await shot(page, 'p1-13-rowfill-panel')
await page.getByRole('button', { name: /Seleccionar cultivo/i }).click()
await page.waitForTimeout(500)
await shot(page, 'p1-14-crop-picker')
await page.getByRole('button', { name: /Guineo/ }).first().click()
await page.waitForTimeout(400)
await page.locator('input[type=number]:visible').first().fill('4')
await page.getByRole('button', { name: /Crear \d+ hileras/i }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(2500)
await shot(page, 'p1-15-field-saved')

// Moment 8: "log that I fertilized today" — where?
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await shot(page, 'p1-16-find-the-labor')

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
