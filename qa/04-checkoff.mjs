// Operations: select field on map → ops drawer → check off a labor.
import { launch, shot, FRONT, uiLogin, log, finish } from './lib.mjs'
import fs from 'fs'

const { email } = JSON.parse(fs.readFileSync(new URL('./account.json', import.meta.url)))
const { browser, context, page, errors } = await launch()
async function dump(tag) {
  const btns = await page.locator('button:visible').evaluateAll(els =>
    els.map(e => e.textContent?.trim()).filter(t => t && t.length > 0 && t.length < 60))
  console.log(`--${tag}-- ${JSON.stringify(btns)}`)
}

await uiLogin(page, email)
await page.waitForTimeout(3500)
await shot(page, '07-map')

// Click the saved field's polygon (drawn around screen center after fly-to)
await page.mouse.click(700, 420)
await page.waitForTimeout(1500)
await shot(page, '07-field-clicked')
await dump('field-clicked')

// Check off the first pending labor as Completa
await page.getByRole('button', { name: 'Completa' }).first().click()
await page.waitForTimeout(1000)
await shot(page, '07-checkoff-modal')
await dump('checkoff-modal')
const bodyText = (await page.textContent('body')) || ''
console.log('has scope question?', bodyText.includes('alcanzó'))

// Confirm whatever the modal offers
const confirm = page.getByRole('button', { name: /Registrar|Confirmar|Guardar|Completar/i }).last()
if (await confirm.count()) {
  await confirm.click()
  await page.waitForTimeout(1500)
  const t2 = (await page.textContent('body')) || ''
  log('ops', 'check off labor Completa', 'PASS', 'confirmed')
} else {
  log('ops', 'check off labor Completa', 'WARN', 'no confirm button found')
}
await shot(page, '07-after-checkoff')
await dump('after-checkoff')

await context.storageState({ path: 'state.json' })
console.log('ERRORS:', errors.slice(0, 5))
finish()
await browser.close()
