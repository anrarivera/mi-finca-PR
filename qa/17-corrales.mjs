// Corrales: create a livestock field, add a herd, log producción, meat decrements.
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
  console.log(`--${tag}-- BTN ${JSON.stringify(btns)}\n  IN ${JSON.stringify(inputs)}`)
}

await open(page, email)
await page.mouse.click(101, 420)
await page.waitForTimeout(700)

// ── Create a corral (livestock field) ────────────────────────────
await page.getByRole('button', { name: /Nuevo campo/i }).click()
await page.waitForTimeout(1000)
await page.fill('input[placeholder*="plátanos"]', 'Corral QA')
await page.getByRole('button', { name: /Animales/ }).click()
await page.waitForTimeout(500)
await shot(page, '17-corral-kind')
await dump('corral-kind')
await page.getByRole('button', { name: /Polígono/i }).click()
await page.getByRole('button', { name: /Dibujar/i }).last().click()
await page.waitForTimeout(400)
for (const [x, y] of [[900, 300], [1000, 300], [950, 380]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(250)
}
await page.mouse.click(900, 300)
await page.waitForTimeout(600)
await shot(page, '17-corral-drawn')
await dump('corral-drawn')
await page.getByRole('button', { name: /Guardar campo/i }).click()
await page.waitForTimeout(2500)
const t1 = await page.evaluate(() => document.body.innerText)
log('corrales', 'create corral field', t1.includes('Campo guardado') || t1.includes('Corral QA') ? 'PASS' : 'WARN')
await shot(page, '17-corral-saved')

// ── Herd management: Cuaderno → Animales tab ─────────────────────
await page.goto(FRONT + '/inventory')
await page.waitForTimeout(2000)
await page.getByRole('button', { name: /Animales/i }).click()
await page.waitForTimeout(1200)
await shot(page, '17-animales-tab')
await dump('animales-tab')

finish()
await context.storageState({ path: 'state.json' })
await browser.close()
