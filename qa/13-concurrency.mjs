// Two tabs, one account (same context = shared cookies, like a real browser).
// A works on a field while B deletes it / edits it concurrently.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page: pageA } = await launch({ state: 'state.json' })
const pageB = await context.newPage()
pageB.setDefaultTimeout(8000)
const crashes = []
for (const [tag, p] of [['A', pageA], ['B', pageB]]) {
  p.on('pageerror', e => crashes.push(`${tag}: ${e.message.slice(0, 120)}`))
}
const acceptDialogs = p => p.on('dialog', d => d.accept().catch(() => {}))
acceptDialogs(pageA); acceptDialogs(pageB)

await open(pageA, email)
await pageB.goto(FRONT + '/')
await pageB.waitForTimeout(3000)

// ── Scenario 1: B deletes the field A is working in ──────────────
// A: open the ops panel for the first field
await pageA.mouse.click(101, 420)
await pageA.waitForTimeout(700)
await pageA.getByRole('button', { name: 'Operaciones' }).first().click()
await pageA.waitForTimeout(1200)

// B: delete that same field
await pageB.mouse.click(101, 420)
await pageB.waitForTimeout(700)
await pageB.getByRole('button', { name: 'Eliminar' }).first().click()
await pageB.waitForTimeout(500)
await pageB.getByRole('button', { name: 'Sí, eliminar' }).click()
await pageB.waitForTimeout(2000)
log('concurrency', 'B deletes field while A has it open', 'PASS', 'delete succeeded in B')

// A: try to check off an operation on the now-deleted field
const panelA = pageA.locator('div.fixed.z-\\[2100\\]')
const completa = panelA.getByRole('button', { name: 'Completa' }).first()
if (await completa.count()) {
  await completa.click()
  await pageA.waitForTimeout(800)
  const confirm = pageA.getByRole('button', { name: 'Confirmar' })
  if (await confirm.count()) {
    await confirm.click()
    await pageA.waitForTimeout(2000)
  }
  const bodyA = await pageA.evaluate(() => document.body.innerText)
  const blank = bodyA.trim().length < 40
  log('concurrency', 'A checking off on deleted field: no crash', blank || crashes.length ? 'FAIL' : 'PASS',
    crashes[0] ?? (blank ? 'page went blank' : 'app still renders'))
  await shot(pageA, '13-a-after-stale-checkoff')
} else {
  log('concurrency', 'A stale check-off', 'WARN', 'no Completa visible in A panel')
}

// ── Scenario 2: both tabs edit the same remaining field ──────────
for (const [tag, p] of [['A', pageA], ['B', pageB]]) {
  await p.goto(FRONT + '/')
  await p.waitForTimeout(2500)
  await p.mouse.click(101, 420)
  await p.waitForTimeout(700)
  await p.getByRole('button', { name: 'Editar' }).first().click()
  await p.waitForTimeout(1000)
  log('concurrency', `${tag} opened editor on same field`, 'PASS')
}
await pageA.fill('input[placeholder*="plátanos"]', 'Editado por A')
await pageA.getByRole('button', { name: /Guardar campo/i }).click()
await pageA.waitForTimeout(2000)
await pageB.fill('input[placeholder*="plátanos"]', 'Editado por B')
await pageB.getByRole('button', { name: /Guardar campo/i }).click()
await pageB.waitForTimeout(2000)
const bodyB = await pageB.evaluate(() => document.body.innerText)
log('concurrency', 'sequential saves from two tabs: last write wins', bodyB.includes('Editado por B') ? 'PASS' : 'WARN')
await shot(pageB, '13-b-last-write')
log('concurrency', 'zero uncaught page errors across both tabs', crashes.length === 0 ? 'PASS' : 'FAIL', crashes.join(' | ').slice(0, 150))

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
