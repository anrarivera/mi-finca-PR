// Runtime accessibility audit — axe-core over the app's key screens,
// entered through a fresh demo account. Reports WCAG A/AA violations
// grouped by impact; the summary at the end is the scorecard.
import { launch, shot, FRONT, log, finish } from './lib.mjs'
import { AxeBuilder } from '@axe-core/playwright'

const { browser, page } = await launch()

async function scan(name) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // The Leaflet map's internals (tiles, attribution) aren't ours to fix.
    .exclude('.leaflet-container')
    .analyze()
  const byImpact = {}
  for (const v of results.violations) {
    byImpact[v.impact] = byImpact[v.impact] ?? []
    byImpact[v.impact].push(`${v.id} ×${v.nodes.length}`)
  }
  const total = results.violations.reduce((s, v) => s + v.nodes.length, 0)
  console.log(`\n== ${name}: ${results.violations.length} rule(s), ${total} node(s)`)
  for (const impact of ['critical', 'serious', 'moderate', 'minor']) {
    if (byImpact[impact]) console.log(`  ${impact}: ${byImpact[impact].join(', ')}`)
  }
  for (const v of results.violations.slice(0, 6)) {
    console.log(`  - [${v.impact}] ${v.id}: ${v.nodes[0]?.html?.slice(0, 90)}`)
  }
  return results.violations
}

// Public pages
await page.goto(FRONT + '/login')
await page.waitForTimeout(1500)
const login = await scan('login')
await page.goto(FRONT + '/register')
await page.waitForTimeout(1200)
const register = await scan('register')

// Demo account → app pages
await page.goto(FRONT + '/login')
await page.waitForTimeout(800)
await page.getByText('Probar la demo').click()
await page.waitForTimeout(6500)
const skip = page.getByRole('button', { name: /Saltar/ })
if (await skip.count()) { await skip.click(); await page.waitForTimeout(500) }
const map = await scan('map (home)')

await page.goto(FRONT + '/dashboard')
await page.waitForTimeout(2500)
const dash = await scan('dashboard')

await page.goto(FRONT + '/inventory')
await page.waitForTimeout(2500)
const inv = await scan('cuaderno')

await page.goto(FRONT + '/settings')
await page.waitForTimeout(2000)
const settings = await scan('settings')

const all = [login, register, map, dash, inv, settings].flat()
const critical = all.filter(v => v.impact === 'critical').length
const serious = all.filter(v => v.impact === 'serious').length
log('a11y', 'critical violations', critical === 0 ? 'PASS' : 'FAIL', String(critical))
log('a11y', 'serious violations', serious === 0 ? 'PASS' : 'WARN', String(serious))
finish()
await browser.close()
