import { api } from '@/lib/api'
import { useRef, useState } from 'react'
import { Download, Upload, Trash2, Database, Info, Bell, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// Settings — backup/restore/clear are SERVER-side (v2): export downloads
// the account's full data straight from the API; restore transactionally
// replaces it; clear deletes it. The old v1 flow only wrote local stores,
// which the next refetch silently clobbered — and its file never contained
// the operations log, harvests, or findings.
// ──────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation('pages')
  const { confirm, confirmDialog } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    try {
      const { blob, filename } = await api.download('/api/v1/users/me/export')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename ?? `mi-finca-respaldo-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('settings.toasts.backupDownloaded'))
    } catch {
      /* the api client already toasted the reason */
    }
  }

  async function handleImportFile(file: File) {
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      toast.error(t('settings.toasts.invalidJson'))
      return
    }
    // Shallow shape check for fast local feedback — the server validates
    // fully (version, structure) before touching anything.
    const backup = raw as { app?: unknown; farms?: unknown } | null
    if (backup?.app !== 'mi-finca-pr' || !Array.isArray(backup.farms)) {
      toast.error(t('settings.toasts.invalidBackup'))
      return
    }

    const ok = await confirm({
      title: t('settings.restoreConfirm.title'),
      message: t('settings.restoreConfirm.message', { count: backup.farms.length }),
      confirmLabel: t('settings.restoreConfirm.confirm'),
      danger: true,
    })
    if (!ok) return

    try {
      // The server validates the version and shape, replaces the account's
      // data transactionally, and rejects v1 files with a clear message.
      await api.post('/api/v1/users/me/restore', raw)
      toast.success(t('settings.toasts.backupRestored'))
      // Every cache and store is stale now — restart the app cleanly.
      setTimeout(() => window.location.assign('/'), 800)
    } catch {
      /* the api client already toasted the reason */
    }
  }

  async function handleClearAll() {
    const ok = await confirm({
      title: t('settings.clearConfirm.title'),
      message: t('settings.clearConfirm.message'),
      confirmLabel: t('settings.clearConfirm.confirm'),
      danger: true,
    })
    if (!ok) return
    try {
      await api.post('/api/v1/users/me/clear-data')
      toast.success(t('settings.toasts.dataCleared'))
      setTimeout(() => window.location.assign('/'), 800)
    } catch {
      /* the api client already toasted the reason */
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2d4a1e]">{t('settings.title')}</h1>
        <p className="text-sm text-[#9aab8a] mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* ── Data section ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
          <Database size={16} className="text-[#639922]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('settings.data.sectionTitle')}</h2>
        </div>

        <div className="divide-y divide-[#f0f5e8]">
          <SettingsRow
            title={t('settings.data.export.title')}
            description={t('settings.data.export.description')}
            action={
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors shrink-0"
              >
                <Download size={12} /> {t('settings.data.export.button')}
              </button>
            }
          />
          <SettingsRow
            title={t('settings.data.import.title')}
            description={t('settings.data.import.description')}
            action={
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleImportFile(file)
                    e.target.value = ''
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#2d4a1e] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors shrink-0"
                >
                  <Upload size={12} /> {t('settings.data.import.button')}
                </button>
              </>
            }
          />
          <SettingsRow
            title={t('settings.data.clear.title')}
            description={t('settings.data.clear.description')}
            action={
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shrink-0"
              >
                <Trash2 size={12} /> {t('settings.data.clear.button')}
              </button>
            }
          />
        </div>
      </section>

      {/* ── Notifications section (issue #14) ────────────────────── */}
      <LanguageSettings />

      <NotificationSettings />

      <AccountSettings />

      {/* ── About section ────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
          <Info size={16} className="text-[#639922]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('settings.about.sectionTitle')}</h2>
        </div>
        <div className="px-5 py-4 text-xs text-[#5a6a4a] flex flex-col gap-1.5">
          <p><span className="font-semibold text-[#2d4a1e]">Mi Finca PR</span> — {t('settings.about.phase')}</p>
          <p>{t('settings.about.localData')}</p>
          <p className="text-[#9aab8a]">
            {t('settings.about.disclaimer')}
          </p>
        </div>
      </section>

      {confirmDialog}
    </div>
  )
}

// ── Language (i18n) ───────────────────────────────────────────────────
function LanguageSettings() {
  const { t, i18n } = useTranslation()

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Globe size={16} className="text-[#639922]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('language.sectionTitle')}</h2>
      </div>
      <SettingsRow
        title={t('language.rowTitle')}
        description={t('language.rowDescription')}
        action={
          <select
            value={i18n.language?.startsWith('en') ? 'en' : 'es'}
            onChange={e => {
              i18n.changeLanguage(e.target.value)
              // The daily digest email follows User.language — best-effort sync
              api.patch('/api/v1/users/me', { language: e.target.value }).catch(() => {})
            }}
            className="text-xs text-[#5a6a4a] bg-white border border-[#d0dcc0] rounded-lg px-2 py-2 focus:outline-none focus:border-[#639922]"
          >
            <option value="es">{t('language.es')}</option>
            <option value="en">{t('language.en')}</option>
          </select>
        }
      />
    </section>
  )
}

// ── Cuenta — the erasure right (privacy policy). Password-confirmed. ──
function AccountSettings() {
  const { t } = useTranslation('pages')
  const navigate = useNavigate()
  const clearAuth = useAuthStore(s => s.clearAuth)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!password || deleting) return
    setDeleting(true)
    try {
      await api.delete('/api/v1/users/me', { password })
      clearAuth()
      toast.success(t('account.deleted'))
      navigate('/login')
    } catch {
      // handleResponse already toasted the server error (e.g. bad password)
      setDeleting(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-red-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Trash2 size={16} className="text-red-400" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('account.sectionTitle')}</h2>
      </div>
      <SettingsRow
        title={t('account.deleteTitle')}
        description={t('account.deleteDescription')}
        action={
          <button
            onClick={() => { setPassword(''); setConfirming(true) }}
            className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            {t('account.deleteButton')}
          </button>
        }
      />

      {confirming && createPortal(
        <>
          <div aria-hidden="true" className="fixed inset-0 bg-black/40 z-[2400] backdrop-blur-sm"
            onClick={() => !deleting && setConfirming(false)} />
          <div className="fixed inset-0 z-[2410] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
            <div className="bg-white shadow-xl w-full overflow-hidden pointer-events-auto rounded-t-2xl sm:max-w-sm sm:rounded-2xl">
              <div className="px-6 py-4 border-b border-[#e0e8d8]">
                <h2 className="text-base font-semibold text-red-600">{t('account.confirmTitle')}</h2>
              </div>
              <div className="px-6 py-4 flex flex-col gap-3">
                <p className="text-xs text-[#5a6a4a] leading-relaxed">{t('account.confirmWarning')}</p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[#5a6a4a]">{t('account.passwordLabel')}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    // Initial focus inside a just-opened dialog IS correct
                    // focus management (the rule targets page-load autofocus).
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-red-400 transition-colors"
                  />
                </label>
              </div>
              <div className="px-6 py-4 border-t border-[#e0e8d8] flex justify-end gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="px-4 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
                >
                  {t('confirmDialog.cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!password || deleting}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleting ? t('account.deleting') : t('account.confirmButton')}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </section>
  )
}

function SettingsRow({ title, description, action }: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#2d4a1e]">{title}</p>
        <p className="text-[11px] text-[#9aab8a] mt-0.5">{description}</p>
      </div>
      {action}
    </div>
  )
}

// ── Notifications (issue #14) ─────────────────────────────────────────
// In-app alerts only for now — email/SMS delivery is tracked separately
// (issue #11) and will plug into these same preferences.

function NotificationSettings() {
  const { t } = useTranslation('pages')
  const prefs = useSettingsStore(s => s.notificationPrefs)
  const updateLocal = useSettingsStore(s => s.updateNotificationPrefs)

  // The email digest runs on the server, so preference changes must reach
  // it — every update syncs (best-effort) in addition to localStorage.
  function update(patch: Parameters<typeof updateLocal>[0]) {
    updateLocal(patch)
    api.put('/api/v1/users/me/notification-prefs', patch).catch(() => {})
  }

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Bell size={16} className="text-[#639922]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('settings.notifications.sectionTitle')}</h2>
      </div>

      <div className="divide-y divide-[#f0f5e8]">
        <SettingsRow
          title={t('settings.notifications.inApp.title')}
          description={t('settings.notifications.inApp.description')}
          action={
            <ToggleSwitch
              checked={prefs.enabled}
              onChange={v => update({ enabled: v })}
            />
          }
        />
        <SettingsRow
          title={t('settings.notifications.emailDigest.title')}
          description={t('settings.notifications.emailDigest.description')}
          action={
            <ToggleSwitch
              checked={prefs.emailDigest}
              disabled={!prefs.enabled}
              onChange={v => update({ emailDigest: v })}
            />
          }
        />
        <SettingsRow
          title={t('settings.notifications.emailFrequency.title')}
          description={t('settings.notifications.emailFrequency.description')}
          action={
            <select
              value={prefs.emailFrequency}
              disabled={!prefs.enabled || !prefs.emailDigest}
              onChange={e => update({ emailFrequency: e.target.value as 'novedades' | 'semanal' })}
              className="text-xs text-[#5a6a4a] bg-white border border-[#d0dcc0] rounded-lg px-2 py-2 focus:outline-none focus:border-[#639922] disabled:opacity-50"
            >
              <option value="novedades">{t('settings.notifications.emailFrequency.novedades')}</option>
              <option value="semanal">{t('settings.notifications.emailFrequency.semanal')}</option>
            </select>
          }
        />
        <SettingsRow
          title={t('settings.notifications.overdue.title')}
          description={t('settings.notifications.overdue.description')}
          action={
            <ToggleSwitch
              checked={prefs.notifyOverdue}
              disabled={!prefs.enabled}
              onChange={v => update({ notifyOverdue: v })}
            />
          }
        />
        <SettingsRow
          title={t('settings.notifications.dueSoon.title')}
          description={t('settings.notifications.dueSoon.description')}
          action={
            <ToggleSwitch
              checked={prefs.notifyDueSoon}
              disabled={!prefs.enabled}
              onChange={v => update({ notifyDueSoon: v })}
            />
          }
        />
        <SettingsRow
          title={t('settings.notifications.harvest.title')}
          description={t('settings.notifications.harvest.description')}
          action={
            <ToggleSwitch
              checked={prefs.notifyHarvest}
              disabled={!prefs.enabled}
              onChange={v => update({ notifyHarvest: v })}
            />
          }
        />
        <SettingsRow
          title={t('settings.notifications.leadDays.title')}
          description={t('settings.notifications.leadDays.description')}
          action={
            <input
              type="number"
              min={1}
              max={60}
              value={prefs.dueSoonLeadDays}
              disabled={!prefs.enabled}
              onChange={e => {
                const n = Math.round(Number(e.target.value))
                if (Number.isFinite(n)) {
                  update({ dueSoonLeadDays: Math.min(60, Math.max(1, n)) })
                }
              }}
              className="w-16 px-2 py-1.5 text-xs text-[#2d4a1e] border border-[#c8dca8] rounded-lg text-center disabled:opacity-40 focus:outline-none focus:border-[#639922]"
            />
          }
        />
      </div>

      <p className="px-5 py-3 text-[10px] text-[#9aab8a] bg-[#fafcf8] border-t border-[#f0f5e8]">
        {t('settings.notifications.footer')}
      </p>
    </section>
  )
}

function ToggleSwitch({ checked, onChange, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 pointer-coarse:w-12 pointer-coarse:h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-[#639922]' : 'bg-[#d5ddc8]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 pointer-coarse:w-5 pointer-coarse:h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4 pointer-coarse:translate-x-6' : ''
        }`}
      />
    </button>
  )
}
