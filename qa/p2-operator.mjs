// Persona 2: worker invited by code, phone viewport. Task: "record what
// you did today" — a fertilization, then report a pest finding.
import { launch, shot, FRONT, uniqEmail, PASSWORD, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

// Setup (owner, desktop): generate an operator code
const owner = await launch({ state: 'state.json' })
await open(owner.page, email)
await owner.page.mouse.click(101, 420)
await owner.page.waitForTimeout(700)
await owner.page.locator('button[title*="equipo"]').first().click()
await owner.page.waitForTimeout(1000)
await owner.page.getByRole('button', { name: /Generar código/i }).click()
await owner.page.waitForTimeout(1500)
const bodyText = await owner.page.evaluate(() => document.body.innerText)
const code = (bodyText.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0]
console.log('CODE:', code)
await owner.context.storageState({ path: 'state.json' })
await owner.browser.close()

// ── The worker's phone ───────────────────────────────────────────
const { browser, page } = await launch({ phone: true })
const opEmail = uniqEmail('worker')
fs.writeFileSync(new URL('./worker.json', import.meta.url), JSON.stringify({ email: opEmail }))

// Moment 1: register on a phone with an invite code
await page.goto(`${FRONT}/register`)
await page.waitForTimeout(1200)
await shot(page, 'p2-01-register-phone')
await page.fill('#fullName', 'Luis Peón')
await page.fill('#email', opEmail)
await page.fill('#password', PASSWORD)
await page.fill('#confirmPassword', PASSWORD)
await page.fill('#inviteCode', code)
await page.locator('input[name=acceptTerms]').check()
await page.getByRole('button', { name: 'Crear cuenta' }).click()
await page.waitForTimeout(4000)
await shot(page, 'p2-02-landing')

// Moment 2: task — "log the fertilization you did on Los Guineos"
// Count the taps a worker needs. Tap 1: drawer tab.
await page.mouse.click(12, 420)
await page.waitForTimeout(900)
await shot(page, 'p2-03-drawer')
// Tap 2: Completa on the field card's next labor (if visible)
const completa = page.getByRole('button', { name: 'Completa' }).first()
if (await completa.count()) {
  await completa.click()
  await page.waitForTimeout(900)
  await shot(page, 'p2-04-checkoff-modal')
  // Tap 3: confirm
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.waitForTimeout(1500)
  log('p2', 'log a labor: 3 taps from map', 'PASS')
  await shot(page, 'p2-05-after-checkoff')
} else {
  log('p2', 'log a labor', 'WARN', 'no Completa visible on first drawer view')
}

// Moment 3: report a pest finding from the phone
const bug = page.locator('button[title*="hallazgo"]').first()
if (await bug.count()) {
  await bug.click()
  await page.waitForTimeout(900)
  await shot(page, 'p2-06-finding-modal-phone')
  const sel = page.locator('select:visible').first()
  if (await sel.count()) {
    await sel.selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Leve' }).click()
    await page.getByRole('button', { name: /Todo el campo/ }).click()
    await page.getByRole('button', { name: 'Registrar' }).last().click()
    await page.waitForTimeout(1500)
    log('p2', 'report finding from phone', 'PASS')
    await shot(page, 'p2-07-finding-saved')
  }
} else {
  log('p2', 'report finding', 'WARN', 'no hallazgo button visible in drawer view')
}

// Moment 4: what does the worker's Cuaderno/dashboard look like?
await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
await shot(page, 'p2-08-dashboard-phone')

finish()
await browser.close()
