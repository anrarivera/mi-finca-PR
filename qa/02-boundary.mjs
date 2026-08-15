// Draw a realistic small boundary (zoom in first), save, verify.
import { launch, shot, FRONT, uiLogin, log, finish } from './lib.mjs'
import fs from 'fs'

const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))
const { browser, context, page, errors } = await launch()

await uiLogin(page, email)
await page.waitForTimeout(2500)

// Zoom to plausible farm scale (~z16-17)
await page.mouse.move(680, 420)
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, -120)
  await page.waitForTimeout(400)
}
await shot(page, '04-zoomed')

const drawBtn = page.getByRole('button', { name: /Dibujar límite/i })
if (await drawBtn.count()) await drawBtn.click()
else {
  await page.mouse.click(1322, 96) // FAB
  await page.waitForTimeout(400)
  const d2 = page.getByRole('button', { name: /Dibujar límite/i })
  if (await d2.count()) await d2.click()
}
await page.waitForTimeout(800)
for (const [x, y] of [[520, 280], [840, 280], [840, 560], [520, 560]]) {
  await page.mouse.click(x, y)
  await page.waitForTimeout(300)
}
await shot(page, '04-drawn')
const completar = page.getByRole('button', { name: /Completar|Terminar/i })
if (await completar.count()) { await completar.first().click(); await page.waitForTimeout(600) }
await shot(page, '04-complete')
try {
  await page.getByRole('button', { name: /Guardar finca/i }).click()
  await page.waitForTimeout(2000)
  const t = await page.textContent('body')
  if (t.includes('Finca guardada')) log('smoke', 'save farm + toast (small boundary)', 'PASS')
  else log('smoke', 'save farm + toast (small boundary)', 'FAIL', 'no toast')
} catch (e) {
  log('smoke', 'save farm (small boundary)', 'FAIL', e.message.slice(0, 150))
}
await shot(page, '04-saved')

await context.storageState({ path: 'state.json' })
console.log('ERRORS:', errors.slice(0, 5))
finish()
await browser.close()
