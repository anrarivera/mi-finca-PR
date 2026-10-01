// Pure unit tests for lib/today.ts — no database rows involved. The module
// reads APP_TIMEZONE once, at load, so each case loads a fresh copy with
// the environment it needs (and the developer's own .env can't leak in).
type TodayModule = typeof import('../lib/today')

function loadToday(appTimezone?: string): TodayModule {
  const saved = process.env.APP_TIMEZONE
  if (appTimezone === undefined) delete process.env.APP_TIMEZONE
  else process.env.APP_TIMEZONE = appTimezone

  try {
    let mod!: TodayModule
    jest.isolateModules(() => { mod = require('../lib/today') })
    return mod
  } finally {
    if (saved === undefined) delete process.env.APP_TIMEZONE
    else process.env.APP_TIMEZONE = saved
  }
}

describe('todayIsoInAppTz', () => {
  const { APP_TIMEZONE, todayIsoInAppTz } = loadToday()

  it('defaults to Puerto Rico', () => {
    expect(APP_TIMEZONE).toBe('America/Puerto_Rico')
  })

  it('is still today at 9 PM on the island, when UTC is already tomorrow', () => {
    expect(todayIsoInAppTz(new Date('2026-04-05T01:00:00Z'))).toBe('2026-04-04')
  })

  it('changes day at island midnight (04:00 UTC)', () => {
    expect(todayIsoInAppTz(new Date('2026-04-04T03:59:59Z'))).toBe('2026-04-03')
    expect(todayIsoInAppTz(new Date('2026-04-04T04:00:00Z'))).toBe('2026-04-04')
  })

  it('agrees with UTC during the island day', () => {
    // 6:00 AM in Puerto Rico — the daily digest's cron hour.
    expect(todayIsoInAppTz(new Date('2026-08-04T10:00:00Z'))).toBe('2026-08-04')
  })

  it('zero-pads and rolls over months and years', () => {
    expect(todayIsoInAppTz(new Date('2026-03-01T02:00:00Z'))).toBe('2026-02-28')
    expect(todayIsoInAppTz(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31')
  })

  it('defaults to the current instant', () => {
    expect(todayIsoInAppTz()).toBe(todayIsoInAppTz(new Date()))
  })
})

describe('todayInAppTz', () => {
  const { todayInAppTz } = loadToday()

  it('returns UTC midnight of the island date', () => {
    const today = todayInAppTz(new Date('2026-04-05T01:00:00Z'))
    expect(today.toISOString()).toBe('2026-04-04T00:00:00.000Z')
  })

  it('compares with date-only columns as calendar dates', () => {
    // Prisma hands @db.Date values back as UTC midnight of the date.
    const today = todayInAppTz(new Date('2026-04-05T01:00:00Z'))
    expect(new Date('2026-04-04') < today).toBe(false) // due today — not overdue
    expect(new Date('2026-04-03') < today).toBe(true)
  })
})

describe('APP_TIMEZONE', () => {
  it('moves "today" to the configured zone', () => {
    const tokyo = loadToday('Asia/Tokyo') // UTC+9
    expect(tokyo.APP_TIMEZONE).toBe('Asia/Tokyo')
    expect(tokyo.todayIsoInAppTz(new Date('2026-04-04T14:59:59Z'))).toBe('2026-04-04')
    expect(tokyo.todayIsoInAppTz(new Date('2026-04-04T15:00:00Z'))).toBe('2026-04-05')
    expect(tokyo.todayInAppTz(new Date('2026-04-04T15:00:00Z')).toISOString())
      .toBe('2026-04-05T00:00:00.000Z')
  })

  it('falls back to Puerto Rico when set but empty', () => {
    expect(loadToday('').APP_TIMEZONE).toBe('America/Puerto_Rico')
  })

  it('rejects an unknown zone at load, not mid-request', () => {
    expect(() => loadToday('Mars/Olympus_Mons')).toThrow(RangeError)
  })
})
