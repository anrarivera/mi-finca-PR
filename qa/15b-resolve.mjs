// Resolve the treated finding and verify the dashboard clears.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
const panel = () => page.locator('div.fixed.z-\\[2100\\]')

await open(page, email)
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
const opsBtns = page.getByRole('button', { name: 'Operaciones' })
await ((await opsBtns.count()) > 1 ? opsBtns.nth(1) : opsBtns.first()).click()
await page.waitForTimeout(1200)

const resolver = panel().getByRole('button', { name: 'Resuelto' }).first()
if (await resolver.count()) {
  await resolver.click()
  await page.waitForTimeout(1500)
  const t = await page.evaluate(() => document.body.innerText)
  log('finding', 'mark finding Resuelto', t.includes('Sin hallazgos') || !t.includes('Reabrir') ? 'PASS' : 'WARN')
  await shot(page, '15b-resolved')
} else {
  log('finding', 'Resuelto button', 'FAIL', 'not present')
}

await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
const t2 = await page.evaluate(() => document.body.innerText)
const active = (t2.match(/(\d+) hallazgos? activos?/) || [])[1]
log('finding', 'dashboard active findings back to 0', active === undefined || active === '0' ? 'PASS' : 'WARN', `active=${active ?? 'none shown'}`)
await shot(page, '15b-dashboard')

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
