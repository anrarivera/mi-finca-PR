import { useRef } from 'react'
import { z } from 'zod'
import { Download, Upload, Trash2, Database, Info } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import type { Farm } from '@/store/useFarmStore'
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
}

// ── Backup validation ─────────────────────────────────────────────────
// The stores are replaced wholesale on import, so every record must at
// least have the fields the app dereferences (farm.boundary.map,
// farm.fieldIds spread, field.rows ?? [], …). Lenient by design: unknown
// extra keys pass through, and versions newer than ours are rejected with
// a clear message instead of corrupting the current data.

const latLngSchema = z.looseObject({ lat: z.number(), lng: z.number() })

const backupFarmSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  location: z.string().catch(''),
  totalAreaAcres: z.number().catch(0),
  createdAt: z.string().catch(''),
  boundary: z.array(latLngSchema).catch([]),
  fieldIds: z.array(z.string()).catch([]),
})

const backupFieldSchema = z.looseObject({
  id: z.string(),
  farmId: z.string(),
  name: z.string(),
})

const backupLivestockSchema = z.looseObject({
  id: z.string(),
  farmId: z.string(),
  name: z.string(),
  animalType: z.string(),
  currentCount: z.number().catch(0),
  acquisitionDate: z.string().catch(''),
})

const backupSchema = z.looseObject({
  app: z.literal('mi-finca-pr'),
  version: z.number(),
  farms: z.array(backupFarmSchema),
  fields: z.array(backupFieldSchema),
  livestock: z.array(backupLivestockSchema).catch([]),
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
