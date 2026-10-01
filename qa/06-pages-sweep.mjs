// Cuaderno tabs, dashboard tiles, CSV export, language toggle.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page, errors } = await launch({ state: 'state.json' })
await open(page, email)

// ── Cuaderno de campo: all 5 tabs ────────────────────────────────
await page.goto(FRONT + '/inventory')
await page.waitForTimeout(2500)
for (const tab of ['Siembras', 'Labores', 'Cosechas', 'Sanidad', 'Animales']) {
  const btn = page.getByRole('button', { name: new RegExp(tab, 'i') }).first()
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(1200)
    const body = (await page.textContent('body')) || ''
    const hasError = body.includes('error') || body.includes('Error')
    log('cuaderno', `tab ${tab}`, hasError ? 'WARN' : 'PASS')
    await shot(page, `10-tab-${tab}`)
  } else {
    log('cuaderno', `tab ${tab}`, 'FAIL', 'tab button not found')
  }
}

// CSV export (first Export/CSV button found)
const csvBtn = page.getByRole('button', { name: /CSV|Exportar/i }).first()
if (await csvBtn.count()) {
  const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null)
  await csvBtn.click()
  const download = await dl
  log('cuaderno', 'CSV export downloads', download ? 'PASS' : 'WARN', download ? download.suggestedFilename() : 'no download event')
} else {
  log('cuaderno', 'CSV export', 'WARN', 'no export button visible')
}

// ── Panel de control ─────────────────────────────────────────────
await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
await shot(page, '10-dashboard')
const dash = (await page.textContent('body')) || ''
log('dashboard', 'loads with tiles', /Fincas|fincas/.test(dash) ? 'PASS' : 'WARN')

// ── Language toggle ──────────────────────────────────────────────
await page.goto(FRONT + '/settings')
await page.waitForTimeout(2000)
await shot(page, '10-settings')
const enBtn = page.getByRole('button', { name: /English/i }).first()
if (await enBtn.count()) {
  await enBtn.click()
  await page.waitForTimeout(1500)
  const t = (await page.textContent('body')) || ''
  log('i18n', 'switch to English', /Settings|Language|Notifications/.test(t) ? 'PASS' : 'WARN')
  await shot(page, '10-settings-en')
  // check dashboard in English for raw keys
  await page.goto(FRONT + '/dashboard')
  await page.waitForTimeout(2000)
  const d2 = (await page.textContent('body')) || ''
  const rawKeys = d2.match(/\b\w+\.\w+\.\w+\b/g)?.filter(k => k.includes('.') && !k.includes('@') && !/\d/.test(k)) ?? []
  log('i18n', 'dashboard EN no raw keys', rawKeys.length === 0 ? 'PASS' : 'WARN', rawKeys.slice(0, 5).join(', '))
  await shot(page, '10-dashboard-en')
  // switch back
  await page.goto(FRONT + '/settings')
  await page.waitForTimeout(1500)
  const esBtn = page.getByRole('button', { name: /Español/i }).first()
  if (await esBtn.count()) { await esBtn.click(); await page.waitForTimeout(800) }
} else {
  log('i18n', 'language toggle', 'WARN', 'English button not found on settings')
}

console.log('ERRORS:', errors.slice(0, 8))
await context.storageState({ path: 'state.json' })
finish()
await browser.close()
