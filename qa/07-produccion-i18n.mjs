// Producción tab content, language select toggle, EN raw-key sweep.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page, errors } = await launch({ state: 'state.json' })
await open(page, email)

await page.goto(FRONT + '/inventory')
await page.waitForTimeout(2000)
await page.getByRole('button', { name: /Producción/i }).click()
await page.waitForTimeout(1500)
await shot(page, '11-produccion')
const prod = (await page.textContent('body')) || ''
log('harvest', 'harvest visible in Producción tab', prod.includes('50') ? 'PASS' : 'WARN', 'looking for qty 50')

// Sanidad CSV export
await page.getByRole('button', { name: /Sanidad/i }).click()
await page.waitForTimeout(1200)
const csv = page.getByRole('button', { name: /CSV/i }).first()
if (await csv.count()) {
  const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null)
  await csv.click()
  const download = await dl
  log('cuaderno', 'Sanidad CSV export', download ? 'PASS' : 'WARN', download ? download.suggestedFilename() : 'no download')
} else log('cuaderno', 'Sanidad CSV export', 'WARN', 'no CSV button in Sanidad tab')

// Language via the select on settings
await page.goto(FRONT + '/settings')
await page.waitForTimeout(1500)
const langSel = page.locator('select').filter({ hasText: 'Español' }).first()
if (await langSel.count()) {
  await langSel.selectOption({ label: 'English' })
  await page.waitForTimeout(1500)
  const t = (await page.textContent('body')) || ''
  log('i18n', 'switch to English (select)', /Settings|Language|Notifications/i.test(t) ? 'PASS' : 'WARN')
  await shot(page, '11-settings-en')
  await page.goto(FRONT + '/dashboard')
  await page.waitForTimeout(1800)
  const d = (await page.textContent('body')) || ''
  const raw = (d.match(/[a-z]+\.[a-zA-Z]+\.[a-zA-Z.]+/g) || []).filter(k => !k.includes('@') && !/\.(com|net|org)/.test(k))
  log('i18n', 'dashboard EN raw keys', raw.length === 0 ? 'PASS' : 'FAIL', raw.slice(0, 4).join(' | '))
  await shot(page, '11-dashboard-en')
  await page.goto(FRONT + '/inventory')
  await page.waitForTimeout(1800)
  const inv = (await page.textContent('body')) || ''
  const raw2 = (inv.match(/[a-z]+\.[a-zA-Z]+\.[a-zA-Z.]+/g) || []).filter(k => !k.includes('@') && !/\.(com|net|org)/.test(k))
  log('i18n', 'cuaderno EN raw keys', raw2.length === 0 ? 'PASS' : 'FAIL', raw2.slice(0, 4).join(' | '))
  await shot(page, '11-inventory-en')
  // revert
  await page.goto(FRONT + '/settings')
  await page.waitForTimeout(1500)
  await page.locator('select').filter({ hasText: 'English' }).first().selectOption({ label: 'Español' }).catch(() => {})
  await page.waitForTimeout(800)
} else {
  log('i18n', 'language select', 'FAIL', 'select with Español not found')
}

console.log('ERRORS:', errors.slice(0, 5))
await context.storageState({ path: 'state.json' })
finish()
await browser.close()
