// Field creation: Gestionar campos → draw → name → fill rows → save.
import { launch, shot, FRONT, uiLogin, log, finish } from './lib.mjs'
import fs from 'fs'

const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))
const { browser, page, errors } = await launch()

async function dump(tag) {
  const btns = await page.locator('button:visible').evaluateAll(els =>
    els.map(e => e.textContent?.trim() || e.getAttribute('title') || e.getAttribute('aria-label') || '?').filter(Boolean))
  const inputs = await page.locator('input:visible, select:visible').evaluateAll(els =>
    els.map(e => `${e.tagName}:${e.type || ''}:${e.placeholder || e.name || ''}`))
  console.log(`--${tag}-- BTN ${JSON.stringify(btns)}\n  IN ${JSON.stringify(inputs)}`)
}

await uiLogin(page, email)
await page.waitForTimeout(2500)
// zoom toward the farm; app flies to boundary on load
await page.waitForTimeout(1500)
await shot(page, '05-start')

// Open the collapsed drawer (left-edge tab), then "Nuevo campo"
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await shot(page, '05-drawer-open')
const nuevo = page.getByRole('button', { name: /Nuevo campo/i })
if (await nuevo.count()) {
  await nuevo.click()
  log('field', 'enter field editor (Nuevo campo)', 'PASS')
} else {
  log('field', 'enter field editor', 'FAIL', 'Nuevo campo not found')
}
await page.waitForTimeout(1200)
await shot(page, '05-editor-open')
await dump('editor-open')

// Name + polygon shape
await page.fill('input[placeholder*="plátanos"]', 'Campo QA 1')
await page.getByRole('button', { name: /Polígono/i }).click()
await page.waitForTimeout(400)
await dump('after-poligono')
const drawPoly = page.getByRole('button', { name: /Dibujar/i }).last()
await drawPoly.click()
await page.waitForTimeout(500)

// Draw inside the boundary; close by clicking near the first point
for (const [x, y] of [[600, 350], [800, 350], [800, 500], [600, 500]]) {
  await page.mouse.click(x, y)
  await page.waitForTimeout(300)
}
await page.mouse.click(600, 350)
await page.waitForTimeout(800)
await shot(page, '05-polygon-done')
await dump('polygon-done')

// Fill with rows
await page.getByRole('button', { name: /Rellenar con hileras/i }).click()
await page.waitForTimeout(700)
await shot(page, '05-rowfill-panel')
// Pick a crop
await page.getByRole('button', { name: /Seleccionar cultivo/i }).click()
await page.waitForTimeout(600)
await shot(page, '05-crop-picker')
const cropBtns = await page.locator('button:visible').evaluateAll(els =>
  els.map(e => e.textContent?.trim()).filter(t => t && t.length < 40))
console.log('CROPS:', JSON.stringify(cropBtns.slice(0, 40)))
const platano = page.getByRole('button', { name: /Plátano/i }).first()
if (await platano.count()) await platano.click()
else await page.locator('button:visible').nth(10).click()
await page.waitForTimeout(500)

// Limit rows: switch from Máximo to a fixed count if possible
const numInputs = page.locator('input[type=number]:visible')
console.log('num inputs:', await numInputs.count())
// Try setting the first number input (likely cantidad) small — observe button label
await numInputs.first().fill('4')
await page.waitForTimeout(400)
await dump('after-crop')
const crear = page.getByRole('button', { name: /Crear \d+ hileras/i })
console.log('CREAR LABEL:', await crear.first().textContent())
await crear.first().click()
await page.waitForTimeout(1000)
await shot(page, '05-rows-created')
await dump('rows-created')

// Save field
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(2500)
const t = await page.textContent('body')
if (t.includes('Campo guardado')) log('field', 'create field + rows + save', 'PASS')
else log('field', 'create field + rows + save', 'WARN', 'no toast seen')
await shot(page, '05-field-saved')

console.log('ERRORS:', errors.slice(0, 5))
finish()
await browser.close()
