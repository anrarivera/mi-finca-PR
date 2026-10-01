// Herd: add animals to the corral, log producción, meat decrements the herd.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
async function dump(tag) {
  const btns = await page.locator('button:visible').evaluateAll(els =>
    els.map(e => e.textContent?.trim() || e.getAttribute('title')).filter(t => t && t.length < 60))
  const inputs = await page.locator('input:visible, select:visible').evaluateAll(els =>
    els.map(e => `${e.tagName}:${e.type || ''}:${e.placeholder || e.name || ''}`))
  const sels = await page.locator('select:visible').evaluateAll(els =>
    els.map(e => Array.from(e.options).slice(0, 6).map(o => o.textContent?.trim())))
  console.log(`--${tag}-- BTN ${JSON.stringify(btns)}\n  IN ${JSON.stringify(inputs)}\n  SEL ${JSON.stringify(sels)}`)
}

await open(page, email)
await page.goto(FRONT + '/inventory')
await page.waitForTimeout(2000)
await page.getByRole('button', { name: /Animales$/ }).click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /Añadir animales/i }).click()
await page.waitForTimeout(900)
await shot(page, '17b-add-form')

// Fill: gallinas, 10 head, assigned to Corral QA
await page.getByRole('button', { name: /Gallinas/ }).click()
await page.locator('input[placeholder*="Gallinero"]').fill('Gallinero QA')
await page.locator('select:visible').nth(1).selectOption({ label: 'Corral QA' })
await page.locator('input[type=number]:visible').first().fill('10')
await page.getByRole('button', { name: 'Añadir', exact: true }).click()
await page.waitForTimeout(2000)
const t1 = await page.evaluate(() => document.body.innerText)
log('corrales', 'add herd of 10 gallinas to corral', t1.includes('Gallinero QA') ? 'PASS' : 'WARN')
await shot(page, '17b-herd-added')
await dump('herd-row')

finish()
await context.storageState({ path: 'state.json' })
await browser.close()
