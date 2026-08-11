import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { hasUnsavedWork } from '@/store/useUnsavedWorkStore'

// App-chrome navigation guard: leaving the current page discards any
// unsaved work on it (an in-progress boundary, an open field editor, an
// entry form), so every nav control confirms first. Staying on the same
// route never prompts.
export function useGuardedNavigate() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useTranslation()

  /** True when it's OK to leave — clean, or the user confirmed. */
  const confirmLeave = () =>
    !hasUnsavedWork() || window.confirm(t('nav.unsavedLeaveConfirm'))

  /** True when it's OK to go to `path` (same-route moves are free). */
  const confirmLeaveTo = (path: string) => pathname === path || confirmLeave()

  /** navigate() that runs the guard first. */
  const guardedNavigate = (path: string) => {
    if (!confirmLeaveTo(path)) return
    navigate(path)
  }

  return { guardedNavigate, confirmLeave, confirmLeaveTo }
}
