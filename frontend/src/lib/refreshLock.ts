// One refresh at a time across every tab of this browser.
//
// The server rotates refresh tokens with strict single use: the token is
// deleted the moment it is redeemed. All tabs share one cookie, so tabs
// that refresh together — a browser restoring its session reopens them at
// the same instant, and tabs opened together expire together — present
// the same token. One wins. The other is refused and drops to the login
// screen, and when the refusal is a 401 that lands last it also clears
// the cookie the winner was just given, which ends the session for both.
//
// The Web Locks API queues the tabs instead: the second one sends its
// request after the first has finished, with the rotated cookie.
// Browsers without it (and plain-http origins such as LAN dev, where it
// is not exposed) refresh unserialized, as before.

export const REFRESH_LOCK_NAME = 'mi-finca-auth-refresh'

// The part of LockManager this needs — lets tests pass a stand-in, since
// the test environment has no navigator.locks.
export type LockManagerLike = {
  request(name: string, callback: () => Promise<unknown>): Promise<unknown>
}

function browserLocks(): LockManagerLike | null {
  return (typeof navigator !== 'undefined' && navigator.locks) || null
}

// `locks: null` = no lock manager available; the task runs directly.
export function withRefreshLock<T>(
  task: () => Promise<T>,
  locks: LockManagerLike | null = browserLocks()
): Promise<T> {
  if (!locks) return task()
  return locks.request(REFRESH_LOCK_NAME, task) as Promise<T>
}
