// Hallazgo + harvest flows from the docked Operaciones panel.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page, errors } = await launch({ state: 'state.json' })
const panel = () => page.locator('div.fixed.z-\\[2100\\]')
async function dump(tag, scope = page) {
  const btns = await scope.locator('button:visible').evaluateAll(els =>
    els.map(e => e.textContent?.trim()).filter(t => t && t.length > 0 && t.length < 70))
  const inputs = await scope.locator('input:visible, select:visible, textarea:visible').evaluateAll(els =>
    els.map(e => `${e.tagName}:${e.type || ''}:${e.placeholder || e.name || ''}`))
  console.log(`--${tag}-- BTN ${JSON.stringify(btns)}\n  IN ${JSON.stringify(inputs)}`)
}

await open(page, email)
await page.mouse.click(700, 420)
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Operaciones' }).first().click()
await page.waitForTimeout(1200)

// ── Hallazgo: "+ Registrar" in the panel's Hallazgos section ──────
await panel().getByRole('button', { name: 'Registrar' }).first().click()
await page.waitForTimeout(900)
await shot(page, '09-hallazgo-modal')

// Fill: plaga type (first real option), severity, scope row 1, notes
const sel = page.locator('select:visible').first()
await sel.selectOption({ index: 1 })
await page.getByRole('button', { name: 'Moderada' }).click()
await page.getByRole('button', { name: /Hilera 1/ }).click()
await page.locator('textarea:visible').fill('QA: manchas en hojas, ~20 plantas')
await shot(page, '09-hallazgo-filled')
await page.getByRole('button', { name: 'Registrar' }).last().click()
await page.waitForTimeout(1500)
const t1 = (await page.textContent('body')) || ''
log('scouting', 'record hallazgo (Moderada, Hilera 1)', t1.includes('allazgo') && !t1.includes('Cancelar') ? 'PASS' : 'WARN', 'check shot')
await shot(page, '09-hallazgo-saved')

// ── Harvest: Completa on the "Ventana de cosecha" operation ───────
const cosechaRow = panel().locator('div.px-4.py-3').filter({ hasText: 'Ventana de cosecha' }).first()
await cosechaRow.getByRole('button', { name: 'Completa' }).click()
await page.waitForTimeout(1000)
await shot(page, '09-cosecha-modal')

// Fill harvest: 50 units at $1.25
const nums = page.locator('input[type=number]:visible')
await nums.first().fill('50')
await nums.last().fill('1.25')
await page.locator('textarea:visible').last().fill('QA cosecha de prueba')
await shot(page, '09-cosecha-filled')
await page.getByRole('button', { name: 'Confirmar' }).click()
await page.waitForTimeout(1500)
log('harvest', 'record harvest 50 units @ $1.25', 'PASS', 'confirmed — verify in Cuaderno next')
await shot(page, '09-cosecha-saved')

console.log('ERRORS:', errors.slice(0, 5))
await context.storageState({ path: 'state.json' })
finish()
await browser.close()
