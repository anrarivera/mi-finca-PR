// Team: generate operator invite code, join with second account, verify role limits.
import { launch, shot, FRONT, uniqEmail, PASSWORD, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page, errors } = await launch({ state: 'state.json' })
await open(page, email)

// Open drawer → team modal
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await page.locator('button[title*="equipo"]').first().click()
await page.waitForTimeout(1200)
await shot(page, '12-team-modal')

// Generate an operator code (role selector may default to operator)
const gen = page.getByRole('button', { name: /Generar código/i })
if (await gen.count()) {
  await gen.click()
  await page.waitForTimeout(1500)
  await shot(page, '12-code-generated')
  const body = (await page.textContent('body')) || ''
  const code = (body.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0]
  console.log('CODE:', code)
  const idx = body.indexOf('digo de invitaci')
  console.log('CONTEXT:', JSON.stringify(body.slice(Math.max(0, idx - 40), idx + 300)))
  if (code) {
    log('team', 'generate invite code', 'PASS', code)
    fs.writeFileSync(new URL('./invite.json', import.meta.url), JSON.stringify({ code }))
  } else {
    log('team', 'generate invite code', 'FAIL', 'no code pattern found in DOM')
  }
} else {
  log('team', 'generate invite code', 'FAIL', 'Generar código not found')
}
await context.storageState({ path: 'state.json' })

// ── Second account joins via code at registration ────────────────
const { code } = JSON.parse(fs.readFileSync(new URL('./invite.json', import.meta.url)))
const opEmail = uniqEmail('operator')
const page2 = await (await browser.newContext({ viewport: { width: 1360, height: 850 }, locale: 'es-PR' })).newPage()
await page2.goto(FRONT + '/register')
await page2.fill('#fullName', 'QA Operator')
await page2.fill('#email', opEmail)
await page2.fill('#password', PASSWORD)
await page2.fill('#confirmPassword', PASSWORD)
await page2.fill('#inviteCode', code)
await page2.locator('input[name=acceptTerms]').check()
await page2.getByRole('button', { name: 'Crear cuenta' }).click()
await page2.waitForTimeout(4000)
await page2.goto(FRONT + '/')
await page2.waitForTimeout(3500)
await shot(page2, '12-operator-home')
const opBody = (await page2.textContent('body')) || ''
log('team', 'operator joined farm via code', opBody.includes('Finca QA') ? 'PASS' : 'FAIL')

// Operator restriction sweep
await page2.mouse.click(101, 420)
await page2.waitForTimeout(700)
await shot(page2, '12-operator-drawer')
const opBtns = await page2.locator('button:visible').evaluateAll(els =>
  els.map(e => e.textContent?.trim() || e.getAttribute('title')).filter(Boolean))
console.log('OPERATOR BTNS:', JSON.stringify(opBtns))
log('roles', 'operator: no Nuevo campo', opBtns.some(b => /Nuevo campo/.test(b)) ? 'FAIL' : 'PASS')
log('roles', 'operator: no boundary FAB', opBtns.some(b => /Límite de finca/.test(b)) ? 'FAIL' : 'PASS')
log('roles', 'operator: can see farm + fields', opBtns.some(b => /Finca QA/.test(b)) ? 'PASS' : 'FAIL')

console.log('ERRORS:', errors.slice(0, 5))
finish()
await browser.close()
