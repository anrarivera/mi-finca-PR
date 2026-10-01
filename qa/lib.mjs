import { chromium } from 'playwright'
import fs from 'fs'

export const FRONT = 'http://localhost:5173'
export const API = 'http://localhost:3001'
export const SHOTS = new URL('./shots/', import.meta.url).pathname.replace(/^\/(\w):/, '$1:')

fs.mkdirSync(SHOTS, { recursive: true })

export function uniqEmail(tag) {
  return `qa-${tag}-${Date.now().toString(36)}@example.com`
}

export const PASSWORD = 'QaTester#2026'

export async function launch(opts = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({
    viewport: opts.phone ? { width: 390, height: 844 } : { width: 1360, height: 850 },
    isMobile: opts.phone || false,
    hasTouch: opts.phone || false,
    locale: 'es-PR',
    ...(opts.state ? { storageState: new URL(`./${opts.state}`, import.meta.url).pathname.replace(/^\/(\w):/, '$1:') } : {}),
  })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`) })
  return { browser, context, page, errors }
}

export async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}${name}.png` })
}

// Register a throwaway account through the API (fast path when the
// register form itself is not under test).
export async function apiRegister(email, fullName = 'QA Tester') {
  const res = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, fullName }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(`register failed: ${JSON.stringify(json)}`)
  return json.data
}

// UI login — sets up both the refresh cookie and the in-memory token.
export async function uiLogin(page, email) {
  await page.goto(`${FRONT}/login`)
  await page.getByRole('textbox').first().fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()
  await page.waitForURL(u => !String(u).includes('/login'), { timeout: 8000 })
}

// Open the app resiliently: storage state first, UI login as fallback.
export async function open(page, email) {
  await page.goto(`${FRONT}/`)
  await page.waitForTimeout(3000)
  if (page.url().includes('/login')) {
    await uiLogin(page, email)
    await page.waitForTimeout(3000)
  }
}

export const results = []
export function log(section, item, status, note = '') {
  results.push({ section, item, status, note })
  console.log(`[${status}] ${section} :: ${item}${note ? ' — ' + note : ''}`)
}

export function finish() {
  const fails = results.filter(r => r.status !== 'PASS')
  console.log(`\n==== ${results.length} checks, ${fails.length} not passing ====`)
}
