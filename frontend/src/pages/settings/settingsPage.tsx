import { useRef } from 'react'
import { z } from 'zod'
import { Download, Upload, Trash2, Database, Info, Bell } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useCropStore } from '@/store/useCropStore'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import type { Farm } from '@/store/useFarmStore'
import type { CustomCrop } from '@/store/useCropStore'
import type { PlacedField } from '@/features/field/types'
import type { LivestockUnit } from '@/features/livestock/types'

// ──────────────────────────────────────────────────────────────────────────
// Settings — data backup/restore while the app runs offline-first. The
// export file contains every persisted store, so a farmer can move their
// finca to another device or keep a respaldo before experimenting.
// ──────────────────────────────────────────────────────────────────────────

const BACKUP_VERSION = 1

type BackupFile = {
  app: 'mi-finca-pr'
  version: number
  exportedAt: string
  farms: unknown
  activeFarmId: unknown
  favoriteFarmId: unknown
  fields: unknown
  livestock: unknown
  customCrops: unknown
}

// ── Backup validation ─────────────────────────────────────────────────
// The stores are replaced wholesale on import, so this validates the FULL
// depth of what the app dereferences (rows, plants, planting events,
// operations…). All-or-nothing on purpose: any structural problem rejects
// the import BEFORE anything is overwritten — never a partial restore, and
// never an array-level fallback that could silently wipe a whole store.
// Unknown extra keys pass through (loose objects) for forward compat;
// versions newer than ours are rejected with a clear message.

const latLngSchema = z.looseObject({ lat: z.number(), lng: z.number() })

const backupPlantSchema = z.looseObject({
  id: z.string(),
  cropTypeId: z.string(),
  lat: z.number(),
  lng: z.number(),
  plantingDate: z.string(),
})

const backupRowSchema = z.looseObject({
  id: z.string(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number(),
  endLng: z.number(),
  spacingFt: z.number(),
  primaryCropTypeId: z.string(),
  companionCropTypeId: z.string().nullable().catch(null),
  plantingDate: z.string(),
  plants: z.array(backupPlantSchema),
  path: z.array(latLngSchema).optional(),
  pathClosed: z.boolean().optional(),
})

const backupOperationSchema = z.looseObject({
  id: z.string(),
  plantingEventId: z.string().catch(''),
  templateId: z.string(),
  type: z.string(),
  labelEs: z.string(),
  recommendedDate: z.string(),
  status: z.enum(['pending', 'due', 'completed', 'skipped']).catch('pending'),
  completedDate: z.string().optional(),
  notes: z.string().optional(),
  product: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
})

const backupEventSchema = z.looseObject({
  id: z.string(),
  fieldId: z.string(),
  cropTypeId: z.string(),
  plantingDate: z.string(),
  plantCount: z.number().catch(0),
  rowIds: z.array(z.string()).catch([]),
  freePlantIds: z.array(z.string()).catch([]),
  operations: z.array(backupOperationSchema),
})

const backupFarmSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  location: z.string().catch(''),
  totalAreaAcres: z.number().catch(0),
  createdAt: z.string().catch(''),
  boundary: z.array(latLngSchema),
  fieldIds: z.array(z.string()),
})

const backupFieldSchema = z.looseObject({
  id: z.string(),
  farmId: z.string(),
  name: z.string(),
  color: z.string().catch('#8fba4e'),
  shape: z.enum(['rectangle', 'polygon']).catch('rectangle'),
  widthFt: z.number().catch(100),
  heightFt: z.number().catch(100),
  farmLat: z.number(),
  farmLng: z.number(),
  rotation: z.number().catch(0),
  isPositioning: z.boolean().catch(false),
  displayMode: z.enum(['shape', 'pin']).catch('shape'),
  boundary: z.array(latLngSchema).optional(),
  rows: z.array(backupRowSchema).optional(),
  freePlants: z.array(backupPlantSchema).optional(),
  plantingEvents: z.array(backupEventSchema).optional(),
})

const backupLivestockSchema = z.looseObject({
  id: z.string(),
  farmId: z.string(),
  name: z.string(),
  animalType: z.string(),
  currentCount: z.number().catch(0),
  acquisitionDate: z.string(),
  notes: z.string().optional(),
})

const backupCustomCropSchema = z.looseObject({
  crop: z.looseObject({
    id: z.string(),
    name: z.string(),
    nameEs: z.string(),
    emoji: z.string().catch('🌱'),
    category: z.string().catch('Personalizados'),
  }),
  schedule: z.looseObject({
    cropTypeId: z.string(),
    harvestWindowStartDays: z.number(),
    harvestWindowEndDays: z.number(),
    operations: z.array(z.looseObject({
      id: z.string(),
      type: z.string(),
      labelEs: z.string(),
      offsetDays: z.number(),
    })),
  }).nullable(),
})

const backupSchema = z.looseObject({
  app: z.literal('mi-finca-pr'),
  version: z.number(),
  farms: z.array(backupFarmSchema),
  fields: z.array(backupFieldSchema),
  // No array-level .catch here: one bad record must reject the whole
  // import with an error, not silently erase every animal.
  livestock: z.array(backupLivestockSchema),
  // Optional (not caught) for backups made before custom crops existed.
  customCrops: z.array(backupCustomCropSchema).optional(),
  activeFarmId: z.string().nullable().catch(null),
  favoriteFarmId: z.string().nullable().catch(null),
})

export default function SettingsPage() {
  const { confirm, confirmDialog } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    const farmState = useFarmStore.getState()
    const backup: BackupFile = {
      app: 'mi-finca-pr',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      farms: farmState.farms,
      activeFarmId: farmState.activeFarmId,
      favoriteFarmId: farmState.favoriteFarmId,
      fields: useFieldStore.getState().fields,
      livestock: useLivestockStore.getState().units,
      customCrops: useCropStore.getState().customCrops,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mi-finca-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Respaldo descargado')
  }

  async function handleImportFile(file: File) {
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      toast.error('El archivo no es un JSON válido.')
      return
    }

    const parsed = backupSchema.safeParse(raw)
    if (!parsed.success) {
      toast.error('El archivo no parece ser un respaldo válido de Mi Finca PR.')
      return
    }
    const data = parsed.data
    if (data.version > BACKUP_VERSION) {
      toast.error('Este respaldo es de una versión más nueva de la aplicación.')
      return
    }

    const farmCount = data.farms.length
    const ok = await confirm({
      title: '¿Restaurar respaldo?',
      message: `El respaldo contiene ${farmCount} ${farmCount === 1 ? 'finca' : 'fincas'}. Se reemplazarán todos los datos actuales de la aplicación.`,
      confirmLabel: 'Restaurar',
      danger: true,
    })
    if (!ok) return

    // Only restore ids that actually resolve to a farm in the backup.
    const farmIds = new Set(data.farms.map(f => f.id))
    useFarmStore.setState({
      farms: data.farms as Farm[],
      activeFarmId: data.activeFarmId && farmIds.has(data.activeFarmId) ? data.activeFarmId : null,
      favoriteFarmId: data.favoriteFarmId && farmIds.has(data.favoriteFarmId) ? data.favoriteFarmId : null,
    })
    useFieldStore.setState({ fields: data.fields as unknown as PlacedField[] })
    useLivestockStore.setState({ units: data.livestock as unknown as LivestockUnit[] })
    useCropStore.setState({ customCrops: (data.customCrops ?? []) as unknown as CustomCrop[] })
    toast.success('Respaldo restaurado')
  }

  async function handleClearAll() {
    const ok = await confirm({
      title: '¿Borrar todos los datos?',
      message: 'Se eliminarán todas las fincas, campos, animales y calendarios guardados en este dispositivo. Considera descargar un respaldo primero.',
      confirmLabel: 'Borrar todo',
      danger: true,
    })
    if (!ok) return
    useFarmStore.setState({ farms: [], activeFarmId: null, favoriteFarmId: null })
    useFieldStore.setState({ fields: [] })
    useLivestockStore.setState({ units: [] })
    useCropStore.setState({ customCrops: [] })
    toast.success('Datos eliminados')
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2d4a1e]">Configuración</h1>
        <p className="text-sm text-[#9aab8a] mt-1">Datos y preferencias de la aplicación</p>
      </div>

      {/* ── Data section ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
          <Database size={16} className="text-[#639922]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">Mis datos</h2>
        </div>

        <div className="divide-y divide-[#f0f5e8]">
          <SettingsRow
            title="Descargar respaldo"
            description="Guarda todas tus fincas, campos, animales y calendarios en un archivo JSON."
            action={
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors shrink-0"
              >
                <Download size={12} /> Exportar
              </button>
            }
          />
          <SettingsRow
            title="Restaurar respaldo"
            description="Reemplaza los datos actuales con un archivo de respaldo exportado antes."
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
                  <Upload size={12} /> Importar
                </button>
              </>
            }
          />
          <SettingsRow
            title="Borrar todos los datos"
            description="Elimina todo lo guardado en este dispositivo. Esta acción no se puede deshacer."
            action={
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shrink-0"
              >
                <Trash2 size={12} /> Borrar todo
              </button>
            }
          />
        </div>
      </section>

      {/* ── Notifications section (issue #14) ────────────────────── */}
      <NotificationSettings />

      {/* ── About section ────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
          <Info size={16} className="text-[#639922]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">Acerca de</h2>
        </div>
        <div className="px-5 py-4 text-xs text-[#5a6a4a] flex flex-col gap-1.5">
          <p><span className="font-semibold text-[#2d4a1e]">Mi Finca PR</span> — Fase 1: Herramienta de manejo de fincas</p>
          <p>Tus datos se guardan localmente en este navegador. Descarga respaldos con frecuencia.</p>
          <p className="text-[#9aab8a]">
            Las recomendaciones agronómicas son orientativas y no sustituyen el consejo de un agrónomo licenciado.
          </p>
        </div>
      </section>

      {confirmDialog}
    </div>
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
  const prefs = useSettingsStore(s => s.notificationPrefs)
  const update = useSettingsStore(s => s.updateNotificationPrefs)

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Bell size={16} className="text-[#639922]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">Notificaciones</h2>
      </div>

      <div className="divide-y divide-[#f0f5e8]">
        <SettingsRow
          title="Notificaciones en la aplicación"
          description="Muestra alertas de operaciones en la campana de la barra superior."
          action={
            <ToggleSwitch
              checked={prefs.enabled}
              onChange={v => update({ enabled: v })}
            />
          }
        />
        <SettingsRow
          title="Operaciones vencidas"
          description="Avisa cuando una operación pasó de su fecha recomendada sin completarse."
          action={
            <ToggleSwitch
              checked={prefs.notifyOverdue}
              disabled={!prefs.enabled}
              onChange={v => update({ notifyOverdue: v })}
            />
          }
        />
        <SettingsRow
          title="Operaciones próximas"
          description="Avisa sobre operaciones que vencen dentro de los días de anticipación."
          action={
            <ToggleSwitch
              checked={prefs.notifyDueSoon}
              disabled={!prefs.enabled}
              onChange={v => update({ notifyDueSoon: v })}
            />
          }
        />
        <SettingsRow
          title="Ventanas de cosecha"
          description="Avisa cuando se acerca o abre la ventana de cosecha de un cultivo."
          action={
            <ToggleSwitch
              checked={prefs.notifyHarvest}
              disabled={!prefs.enabled}
              onChange={v => update({ notifyHarvest: v })}
            />
          }
        />
        <SettingsRow
          title="Días de anticipación"
          description="Cuántos días antes de la fecha recomendada empieza el aviso (1–60)."
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
        Los avisos por correo electrónico y mensajes de texto llegarán en una
        versión futura.
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
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-[#639922]' : 'bg-[#d5ddc8]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  )
}
