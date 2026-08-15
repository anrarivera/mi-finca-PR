// Settings: export backup, restore it, reject invalid JSON.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
import path from 'path'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
await open(page, email)
await page.goto(FRONT + '/settings')
await page.waitForTimeout(2000)

// ── Export ───────────────────────────────────────────────────────
const dlPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
await page.getByRole('button', { name: 'Exportar' }).click()
const download = await dlPromise
if (download) {
  const dest = path.resolve('shots', 'backup.json')
  await download.saveAs(dest)
  const parsed = JSON.parse(fs.readFileSync(dest, 'utf8'))
  log('backup', 'export downloads valid JSON', parsed && typeof parsed === 'object' ? 'PASS' : 'FAIL', download.suggestedFilename())
} else {
  log('backup', 'export download', 'FAIL', 'no download event')
}

// ── Restore the same backup ──────────────────────────────────────
const fileInput = page.locator('input[type=file]')
if (await fileInput.count()) {
  await fileInput.setInputFiles(path.resolve('shots', 'backup.json'))
  await page.waitForTimeout(1000)
  await shot(page, '16-restore-confirm')
  // Restore has a custom confirm modal
  const btns = await page.locator('button:visible').evaluateAll(els => els.map(e => e.textContent?.trim()).filter(Boolean))
  console.log('CONFIRM BTNS:', JSON.stringify(btns.slice(-8)))
  const confirm = page.getByRole('button', { name: /Restaurar|Confirmar|S[ií], /i }).last()
  if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(2500) }
  const t1 = await page.evaluate(() => document.body.innerText)
  log('backup', 'restore same backup succeeds', /respaldo restaurado|restaurado/i.test(t1) ? 'PASS' : 'WARN', 'see shot')
  await shot(page, '16-restored')
} else {
  log('backup', 'restore input', 'FAIL', 'no file input found')
}

// ── Invalid JSON rejected ────────────────────────────────────────
const badPath = path.resolve('shots', 'bad.json')
fs.writeFileSync(badPath, 'this is not json{{{')
await page.locator('input[type=file]').setInputFiles(badPath)
await page.waitForTimeout(1500)
const t2 = await page.evaluate(() => document.body.innerText)
log('backup', 'invalid JSON rejected with message', /no es un JSON|inv[aá]lido|no se pudo/i.test(t2) ? 'PASS' : 'WARN', 'see shot')
await shot(page, '16-invalid-json')

// App still healthy after restore: fields present
await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
const t3 = await page.evaluate(() => document.body.innerText)
log('backup', 'data intact after restore (dashboard tiles)', /Campos/i.test(t3) ? 'PASS' : 'WARN')

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
