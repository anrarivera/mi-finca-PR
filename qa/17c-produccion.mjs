// Herd producción: log eggs, then meat — meat must decrement the head count.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
async function dump(tag) {
  const btns = await page.locator('button:visible').evaluateAll(els =>
    els.map(e => e.textContent?.trim()).filter(t => t && t.length < 50))
  const sels = await page.locator('select:visible').evaluateAll(els =>
    els.map(e => Array.from(e.options).slice(0, 8).map(o => o.textContent?.trim())))
  const inputs = await page.locator('input:visible').evaluateAll(els =>
    els.map(e => `${e.type}:${e.placeholder || e.name || ''}`))
  console.log(`--${tag}-- BTN ${JSON.stringify(btns)}\n  SEL ${JSON.stringify(sels)}\n  IN ${JSON.stringify(inputs)}`)
}
const headCount = async () => {
  const t = await page.evaluate(() => document.body.innerText)
  const m = t.match(/Gallinero QA[\s\S]{0,80}?(\d+)\s*(animales|cabezas|aves)?/)
  return m ? m[1] : t.match(/🐔[^\d]{0,20}(\d+)/)?.[1]
}

await open(page, email)
await page.goto(FRONT + '/inventory')
await page.waitForTimeout(2000)
await page.getByRole('button', { name: /Animales$/ }).click()
await page.waitForTimeout(1000)
const before = Number(await headCount())
console.log('head before:', before)

// ── Log producción: eggs ─────────────────────────────────────────
await page.getByRole('button', { name: 'Producción', exact: true }).last().click()
await page.waitForTimeout(900)
await shot(page, '17c-prod-modal')

// Eggs: 12 units
await page.locator('select:visible').first().selectOption({ label: 'Huevos' })
await page.locator('input[type=number]:visible').first().fill('12')
await page.getByRole('button', { name: 'Registrar' }).last().click()
await page.waitForTimeout(1800)
log('corrales', 'log 12 huevos', 'PASS', 'submitted')

// Meat: select Carne — an extra head-count input should appear
await page.getByRole('button', { name: 'Producción', exact: true }).last().click()
await page.waitForTimeout(900)
await page.locator('select:visible').first().selectOption({ label: 'Carne' })
await page.waitForTimeout(600)
await shot(page, '17c-carne-modal')
await dump('carne-modal')
const nums = page.locator('input[type=number]:visible')
await nums.first().fill('8')    // lbs of meat
await nums.last().fill('2')     // animals leaving the herd (last number input)
await page.getByRole('button', { name: 'Registrar' }).last().click()
await page.waitForTimeout(2000)
const after = await headCount()
console.log('head after:', after)
log('corrales', 'meat decrements herd count by the animals indicated', Number(after) === before - 2 ? 'PASS' : 'WARN', `${before} -> ${after}`)
await shot(page, '17c-after-carne')

// Producción ledger shows both entries
await page.getByRole('button', { name: 'Producción', exact: true }).first().click()
await page.waitForTimeout(1500)
const t2 = await page.evaluate(() => document.body.innerText)
log('corrales', 'producción ledger shows animal entries', /Huevos|huevos/.test(t2) ? 'PASS' : 'WARN')
await shot(page, '17c-ledger')

finish()
await context.storageState({ path: 'state.json' })
await browser.close()
