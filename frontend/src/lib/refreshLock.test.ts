import { describe, it, expect } from 'vitest'
import { withRefreshLock, REFRESH_LOCK_NAME, type LockManagerLike } from './refreshLock'

// Stand-in for navigator.locks: exclusive, first come first served, and
// released whether the callback resolves or rejects — what the browser
// does for every tab of an origin.
function fakeLocks(): LockManagerLike & { names: string[] } {
  let tail: Promise<unknown> = Promise.resolve()
  const names: string[] = []
  return {
    names,
    request(name, callback) {
      names.push(name)
      const run = tail.then(callback)
      tail = run.catch(() => {})
      return run
    },
  }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5))

// The server's rotation and the cookie jar every tab shares. A token is
// valid once; presenting a spent one is answered with a cleared cookie.
function browserAndServer() {
  let valid = 'token-0'
  let issued = 0
  const jar: { cookie: string | null } = { cookie: valid }

  async function refresh(): Promise<boolean> {
    const presented = jar.cookie
    await tick() // the request is in flight
    if (presented === null || presented !== valid) {
      jar.cookie = null
      return false
    }
    valid = `token-${++issued}`
    jar.cookie = valid
    return true
  }

  return { jar, refresh }
}

describe('withRefreshLock', () => {
  it('shows the race it exists for: two tabs refreshing at once lose the session', async () => {
    const { jar, refresh } = browserAndServer()

    const results = await Promise.all([refresh(), refresh()])

    expect(results).toEqual([true, false])
    expect(jar.cookie).toBeNull()
  })

  it('queues the tabs, so both refresh and the session survives', async () => {
    const { jar, refresh } = browserAndServer()
    const locks = fakeLocks()

    const results = await Promise.all([
      withRefreshLock(refresh, locks),
      withRefreshLock(refresh, locks),
    ])

    expect(results).toEqual([true, true])
    expect(jar.cookie).toBe('token-2')
    expect(locks.names).toEqual([REFRESH_LOCK_NAME, REFRESH_LOCK_NAME])
  })

  it('does not start the second refresh before the first has finished', async () => {
    const locks = fakeLocks()
    const events: string[] = []
    const task = (tab: string) => async () => {
      events.push(`${tab} start`)
      await tick()
      events.push(`${tab} end`)
      return true
    }

    await Promise.all([withRefreshLock(task('a'), locks), withRefreshLock(task('b'), locks)])

    expect(events).toEqual(['a start', 'a end', 'b start', 'b end'])
  })

  it('lets the next tab in after a refresh that threw', async () => {
    const locks = fakeLocks()
    const failed = withRefreshLock(async () => { throw new Error('offline') }, locks)
    const next = withRefreshLock(async () => true, locks)

    await expect(failed).rejects.toThrow('offline')
    await expect(next).resolves.toBe(true)
  })

  it('runs the refresh directly where the Web Locks API is missing', async () => {
    await expect(withRefreshLock(async () => 'ran', null)).resolves.toBe('ran')
  })
})
