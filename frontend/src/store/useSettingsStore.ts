import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '@/features/notifications/notificationBuilder'

// ──────────────────────────────────────────────────────────────────────────
// App preferences (issue #14). Notification items themselves are derived on
// the fly (see notificationBuilder); only the preferences and which ids the
// farmer has already seen live here.
// ──────────────────────────────────────────────────────────────────────────

type SettingsState = {
  notificationPrefs: NotificationPrefs
  seenNotificationIds: string[]
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => void
  markNotificationsSeen: (liveIds: string[]) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      seenNotificationIds: [],

      updateNotificationPrefs: (patch) =>
        set(s => ({ notificationPrefs: { ...s.notificationPrefs, ...patch } })),

      // Replaces the list with exactly the ids visible right now, so it can
      // never grow beyond what the bell is currently showing.
      markNotificationsSeen: (liveIds) => set({ seenNotificationIds: liveIds }),
    }),
    {
      name: 'mi-finca-settings',
      partialize: (s) => ({
        notificationPrefs: s.notificationPrefs,
        seenNotificationIds: s.seenNotificationIds,
      }),
    }
  )
)
