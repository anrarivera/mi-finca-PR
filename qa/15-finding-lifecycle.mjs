// Finding lifecycle: create hallazgo → treat ("Tratado") → verify resolution.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
const panel = () => page.locator('div.fixed.z-\\[2100\\]')
async function dump(tag) {
  const btns = await panel().locator('button:visible').evaluateAll(els =>
    els.map(e => e.textContent?.trim() || e.getAttribute('title')).filter(Boolean))
  console.log(`--${tag}-- ${JSON.stringify(btns)}`)
}

await open(page, email)
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
// Target the PLANTED field's card (it shows the plant-count chip) — a
// row-less field has no planting events to scope a finding to.
const plantedCard = page.locator('div').filter({ hasText: /^Campo QA 1/ }).locator('xpath=ancestor-or-self::*[contains(@class,"rounded")]').first()
const opsBtns = page.getByRole('button', { name: 'Operaciones' })
await ((await opsBtns.count()) > 1 ? opsBtns.nth(1) : opsBtns.first()).click()
await page.waitForTimeout(1200)

// ── Create a finding ─────────────────────────────────────────────
await panel().getByRole('button', { name: 'Registrar' }).first().click()
await page.waitForTimeout(900)
await page.locator('select:visible').first().selectOption({ index: 1 })
await page.getByRole('button', { name: 'Severa' }).click()
await page.getByRole('button', { name: 'Todo el campo' }).click()
await page.locator('textarea:visible').fill('QA lifecycle: infestación severa de prueba')
await page.getByRole('button', { name: 'Registrar' }).last().click()
await page.waitForTimeout(1500)
const t1 = await page.evaluate(() => document.body.innerText)
log('finding', 'create severe finding (whole field)', /hallazgo|Tratado|Actualizar/i.test(t1) ? 'PASS' : 'WARN')
await shot(page, '15-finding-created')
await dump('after-create')

// ── Treat it: "Tratado" ──────────────────────────────────────────
const tratado = panel().getByRole('button', { name: 'Tratado' }).first()
if (await tratado.count()) {
  await tratado.click()
  await page.waitForTimeout(1000)
  await shot(page, '15-tratado-clicked')
  await dump('tratado')
  // Whatever confirmation the treat flow offers, take it
  const confirm = page.getByRole('button', { name: /Confirmar|Guardar|Registrar|S[ií]/i }).last()
  if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(1500) }
  const t2 = await page.evaluate(() => document.body.innerText)
  log('finding', 'Tratado flow completes', t2.includes('Sin hallazgos') || !t2.includes('Tratado') ? 'PASS' : 'WARN', 'see shots')
  await shot(page, '15-after-tratado')
} else {
  log('finding', 'Tratado button', 'FAIL', 'not found after creating finding')
}

// ── Dashboard sanidad reflects the change ────────────────────────
await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
const t3 = await page.evaluate(() => document.body.innerText)
console.log('SANIDAD:', (t3.match(/Sanidad[\s\S]{0,120}/) || ['?'])[0].replace(/\n/g, ' '))
await shot(page, '15-dashboard-sanidad')
log('finding', 'dashboard sanidad section renders', t3.includes('Sanidad') ? 'PASS' : 'WARN')

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
