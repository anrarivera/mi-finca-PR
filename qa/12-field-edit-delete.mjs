// Edit an existing field, duplicate-name confirm, delete a field.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
let dialogs = []
let dialogAction = 'dismiss'
page.on('dialog', d => {
  dialogs.push(d.message())
  ;(dialogAction === 'accept' ? d.accept() : d.dismiss()).catch(() => {})
})

await open(page, email)
await page.mouse.click(101, 420)
await page.waitForTimeout(700)

// ── Duplicate name: second field named like the first ────────────
await page.getByRole('button', { name: /Nuevo campo/i }).click()
await page.waitForTimeout(1000)
await page.fill('input[placeholder*="plátanos"]', 'Campo QA 1')
await page.getByRole('button', { name: /Polígono/i }).click()
await page.getByRole('button', { name: /Dibujar/i }).last().click()
await page.waitForTimeout(400)
for (const [x, y] of [[600, 520], [700, 520], [650, 600]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(250)
}
await page.mouse.click(600, 520)
await page.waitForTimeout(600)

dialogs = []; dialogAction = 'dismiss'
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(1200)
const gotConfirm = dialogs.some(m => m.includes('Ya existe un campo'))
log('field-edit', 'duplicate name asks for confirmation', gotConfirm ? 'PASS' : 'FAIL', dialogs[0]?.slice(0, 60) ?? 'no dialog')
const stillEditing = (await page.getByRole('button', { name: /Guardar campo/i }).count()) > 0
log('field-edit', 'declining keeps the editor open', stillEditing ? 'PASS' : 'FAIL')

// Accept on retry
dialogs = []; dialogAction = 'accept'
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(2500)
const t1 = await page.evaluate(() => document.body.innerText)
log('field-edit', 'accepting saves the duplicate', t1.includes('Campo guardado') || !(await page.getByRole('button', { name: /Guardar campo/i }).count()) ? 'PASS' : 'WARN')
await shot(page, '12-duplicate-saved')

// ── Edit an existing field: rename + save ────────────────────────
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
dialogAction = 'accept'
await page.getByRole('button', { name: 'Editar' }).first().click()
await page.waitForTimeout(1200)
await shot(page, '12-editor-existing')
const nameInput = page.locator('input[placeholder*="plátanos"]')
log('field-edit', 'editor opens with existing name', (await nameInput.inputValue()).length > 0 ? 'PASS' : 'FAIL', await nameInput.inputValue())
await nameInput.fill('Campo Renombrado')
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(2500)
const t2 = await page.evaluate(() => document.body.innerText)
log('field-edit', 'rename existing field saves', t2.includes('Campo actualizado') || t2.includes('Campo Renombrado') ? 'PASS' : 'WARN')
await shot(page, '12-renamed')

// ── Delete a field from the drawer card ──────────────────────────
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
const before = await page.getByRole('button', { name: 'Eliminar' }).count()
await page.getByRole('button', { name: 'Eliminar' }).first().click()
await page.waitForTimeout(600)
await shot(page, '12-delete-confirm')
// in-card confirmation — exact label, header buttons are decoys
await page.getByRole('button', { name: 'Sí, eliminar' }).click()
await page.waitForTimeout(2000)
const t3 = await page.evaluate(() => document.body.innerText)
const after = await page.getByRole('button', { name: 'Eliminar' }).count()
log('field-edit', 'delete field removes the card', t3.includes('Campo eliminado') || after < before ? 'PASS' : 'WARN', `cards ${before} -> ${after}`)
await shot(page, '12-deleted')

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
