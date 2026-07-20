import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertCircle, Clock, Wheat, CheckCheck, Settings } from 'lucide-react'
import { useFieldStore } from '@/store/useFieldStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import {
  buildNotifications, formatRelativeDaysEs,
  type FarmNotification,
} from '@/features/notifications/notificationBuilder'
import { getCropById } from '@/features/field/data/cropLibrary'

// ──────────────────────────────────────────────────────────────────────────
// Bell in the top nav (issue #14) — derived overdue / due-soon / harvest
// alerts with an unread badge. Marking as read only records the currently
// visible ids; anything new that appears later counts as unread again.
// ──────────────────────────────────────────────────────────────────────────

const KIND_ICON = {
  overdue: <AlertCircle size={13} className="text-red-500 shrink-0" />,
  dueSoon: <Clock size={13} className="text-amber-500 shrink-0" />,
  harvest: <Wheat size={13} className="text-[#639922] shrink-0" />,
} as const

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const fields = useFieldStore(s => s.fields)
  const prefs = useSettingsStore(s => s.notificationPrefs)
  const seenIds = useSettingsStore(s => s.seenNotificationIds)
  const markSeen = useSettingsStore(s => s.markNotificationsSeen)

  const notifications = useMemo(
    () => buildNotifications(fields, prefs),
    [fields, prefs]
  )
  const unreadCount = useMemo(() => {
    const seen = new Set(seenIds)
    return notifications.filter(n => !seen.has(n.id)).length
  }, [notifications, seenIds])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleMarkAllSeen() {
    markSeen(notifications.map(n => n.id))
  }

  function handleOpenSettings() {
    setOpen(false)
    navigate('/settings')
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
        aria-expanded={open}
        className="relative w-10 h-10 rounded-full text-[#d4e8b0] hover:bg-white/10 transition-colors flex items-center justify-center"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#2d4a1e]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-[1200]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-[#2d4a1e]">Notificaciones</p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllSeen}
                className="flex items-center gap-1 text-[11px] text-[#639922] hover:text-[#2d4a1e] transition-colors"
              >
                <CheckCheck size={12} /> Marcar leídas
              </button>
            )}
          </div>

          {!prefs.enabled ? (
            <p className="px-4 py-6 text-xs text-[#9aab8a] text-center">
              Las notificaciones están desactivadas.
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-xs text-[#9aab8a] text-center">
              Todo al día — no hay operaciones pendientes próximas. 🌱
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-[#f8faf5]">
              {notifications.map(n => (
                <NotificationRow key={n.id} item={n} unread={!seenIds.includes(n.id)} />
              ))}
            </div>
          )}

          <button
            onClick={handleOpenSettings}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] text-[#5a6a4a] bg-[#fafcf8] hover:bg-[#f0f5e8] transition-colors border-t border-gray-100"
          >
            <Settings size={12} /> Configurar notificaciones
          </button>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ item, unread }: { item: FarmNotification; unread: boolean }) {
  const crop = getCropById(item.cropTypeId)
  return (
    <div className={`flex items-start gap-2.5 px-4 py-2.5 ${unread ? 'bg-[#f5f8f0]' : ''}`}>
      <span className="mt-0.5">{KIND_ICON[item.kind]}</span>
      <div className="min-w-0">
        <p className="text-xs text-[#2d4a1e] font-medium truncate">
          {crop?.emoji ? `${crop.emoji} ` : ''}{item.labelEs}
        </p>
        <p className="text-[10px] text-[#9aab8a] mt-0.5">
          {item.fieldName} ·{' '}
          <span className={item.daysFromToday < 0 ? 'text-red-500 font-semibold' : ''}>
            {item.daysFromToday < 0 && item.kind !== 'harvest' ? 'vencida ' : ''}
            {formatRelativeDaysEs(item.daysFromToday)}
          </span>
        </p>
      </div>
      {unread && <span className="ml-auto mt-1.5 w-1.5 h-1.5 rounded-full bg-[#639922] shrink-0" />}
    </div>
  )
}
