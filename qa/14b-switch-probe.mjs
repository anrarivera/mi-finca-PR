// Probe: switching farms from the drawer farms list.
import { launch, shot, FRONT, log, finish, open } from './lib.mjs'
import fs from 'fs'
const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))

const { browser, context, page } = await launch({ state: 'state.json' })
page.on('dialog', d => d.accept().catch(() => {}))
await open(page, email)
await page.mouse.click(101, 420)
await page.waitForTimeout(700)
// If we land at fields level, go up
const body0 = await page.evaluate(() => document.body.innerText)
if (!body0.includes('MIS FINCAS')) { await page.mouse.click(112, 117); await page.waitForTimeout(700) }
await shot(page, '14b-farms')
// Click the Finca QA row's chevron (right side of the row)
await page.mouse.click(364, 192)
await page.waitForTimeout(2500)
await shot(page, '14b-after-chevron')
const body1 = await page.evaluate(() => document.body.innerText)
log('second-farm', 'row chevron enters farm at fields level', /Campo|Nuevo campo/.test(body1) ? 'PASS' : 'WARN')
log('second-farm', 'switched active farm to Finca QA', body1.includes('Finca QA') ? 'PASS' : 'WARN')
await context.storageState({ path: 'state.json' })
finish()
await browser.close()
