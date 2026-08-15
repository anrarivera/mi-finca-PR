// Second-farm flows: create, boundary on the NEW farm, switch between farms.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
await open(page, email)

// Drawer → back to farms level → Añadir finca
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await page.mouse.click(112, 117) // header back chevron (farms level)
await page.waitForTimeout(700)
await shot(page, '14-farms-level')
const addFarm = page.getByRole('button', { name: /Añadir finca/i })
log('second-farm', 'farms level shows Añadir finca', (await addFarm.count()) > 0 ? 'PASS' : 'FAIL')
await addFarm.first().click()
await page.waitForTimeout(700)
const inputs = page.locator('.fixed input:visible, div[role=dialog] input:visible')
await inputs.first().fill('Finca Dos')
await inputs.nth(1).fill('Cayey, PR')
await page.getByRole('button', { name: /Crear finca/i }).click()
await page.waitForTimeout(2500)
await shot(page, '14-after-create')

// Should flow into boundary drawing for the NEW farm with NO inherited boundary
const body1 = await page.evaluate(() => document.body.innerText)
log('second-farm', 'flows into boundary drawing', /Toca el mapa|Dibujar l[ií]mite|esquinas/i.test(body1) ? 'PASS' : 'WARN', 'see shot')

// Zoom in (fresh farm starts at wide view) and draw a small boundary
await page.mouse.move(680, 420)
for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(400) }
const draw = page.getByRole('button', { name: /Dibujar límite/i })
if (await draw.count()) { await draw.click(); await page.waitForTimeout(700) }
for (const [x, y] of [[540, 300], [820, 300], [820, 540], [540, 540]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(300)
}
const comp = page.getByRole('button', { name: /Completar|Terminar/i })
if (await comp.count()) { await comp.first().click(); await page.waitForTimeout(500) }
await page.getByRole('button', { name: /Guardar finca/i }).click()
await page.waitForTimeout(2000)
const body2 = await page.evaluate(() => document.body.innerText)
log('second-farm', 'second boundary saves', body2.includes('Finca guardada') ? 'PASS' : 'WARN')
await shot(page, '14-second-boundary')

// Switch back to the first farm via the drawer farms list
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
await page.mouse.click(112, 117) // back chevron
await page.waitForTimeout(700)
await shot(page, '14-farm-list')
const firstFarmRow = page.getByText('Finca QA', { exact: false }).first()
await firstFarmRow.click()
await page.waitForTimeout(2500)
const body3 = await page.evaluate(() => document.body.innerText)
log('second-farm', 'switch back to first farm shows its fields', body3.includes('Campo QA 1') || body3.includes('Editado por B') ? 'PASS' : 'WARN')
await shot(page, '14-switched-back')

// Pins: the non-active farm should show a clickable pin
const pins = await page.locator('.leaflet-marker-icon').count()
log('second-farm', 'non-active farm pin on map', pins > 0 ? 'PASS' : 'WARN', `${pins} marker icon(s)`)

await context.storageState({ path: 'state.json' })
finish()
await browser.close()
