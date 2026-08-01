import { useTranslation } from 'react-i18next'
import OperationsView from './operationsView'
import FindingsSection from '@/features/scouting/components/findingsSection'
import { useFieldStore } from '@/store/useFieldStore'
import {
  useCompleteRecommendedOp, useSkipRecommendedOp, useUndoRecommendedOp,
  useLogPartialRecommendedOp, useUpdateOperation, useOperations,
} from '../hooks/useOperationsApi'
import { toast } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// Full operations UI for one field, with all persistence wired: complete,
// skip, undo, edit, and partial logs (SDD §6.2). Extracted so both entry
// points share one implementation:
//   - the field editor ("Operaciones" panel button)
//   - the farm drawer ("Operaciones" button on a field card)
// Reads the field reactively from the store; renders nothing if it's gone.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  farmId: string
  fieldId: string
  onClose: () => void
}

export default function FieldOperationsContainer({ farmId, fieldId, onClose }: Props) {
  const { t } = useTranslation('field')
  // Reactive read — check-offs update the store and re-render the view.
  const field = useFieldStore(s => s.fields.find(f => f.id === fieldId))

  const completeOp = useCompleteRecommendedOp(farmId)
  const skipOp = useSkipRecommendedOp(farmId)
  const undoOp = useUndoRecommendedOp(farmId)
  const partialOp = useLogPartialRecommendedOp(farmId)
  const updateOpLog = useUpdateOperation(farmId)
  // Farm operations log — partial-progress captions + edit prefills.
  const { data: farmOperations } = useOperations(farmId)

  if (!field) return null

  return (
    <OperationsView
      plantingEvents={field.plantingEvents ?? []}
      fieldName={field.name}
      fieldId={field.id}
      fieldRows={field.rows ?? []}
      freePlants={field.freePlants ?? []}
      farmOperations={farmOperations ?? []}
      findingsSection={
        <FindingsSection
          farmId={farmId}
          fieldId={field.id}
          fieldRows={field.rows ?? []}
          freePlants={field.freePlants ?? []}
          plantingEvents={field.plantingEvents ?? []}
        />
      }
      onClose={onClose}
      onCompleteOperation={(eventId, opId, data) => {
        completeOp.mutate(
          { fieldId: field.id, eventId, operationId: opId, data },
          { onSuccess: () => toast.success(t('toast.opLogged')) }
        )
      }}
      onSkipOperation={(eventId, opId) => {
        skipOp.mutate({ fieldId: field.id, eventId, operationId: opId })
      }}
      onUndoOperation={(eventId, opId) => {
        // Reopens the item; the server deletes the completing log entry
        // (and its yield) but keeps any partial logs.
        undoOp.mutate(
          { fieldId: field.id, eventId, operationId: opId },
          { onSuccess: () => toast.success(t('toast.opUndone')) }
        )
      }}
      onEditOperation={(_eventId, _opId, logId, data) => {
        // Corrects the linked operations-log entry; the server mirrors the
        // fix onto the recommendation and the harvest yield.
        updateOpLog.mutate(
          {
            id: logId,
            updates: {
              actualDate: data.completedDate,
              product: data.product ?? null,
              quantity: data.quantity ?? null,
              unit: data.unit ?? null,
              notes: data.notes ?? null,
              rowIds: data.rowIds ?? [],
              plantIds: data.plantIds ?? [],
            },
          },
          { onSuccess: () => toast.success(t('toast.opCorrected')) }
        )
      }}
      onPartialLog={(_eventId, opId, data) => {
        // Multi-day harvest: logs the day's progress, item stays open.
        partialOp.mutate(
          {
            operationId: opId,
            data: {
              date: data.completedDate,
              product: data.product,
              quantity: data.quantity,
              unit: data.unit,
              notes: data.notes,
              rowIds: data.rowIds,
              plantIds: data.plantIds,
            },
          },
          { onSuccess: () => toast.success(t('toast.partialLogged')) }
        )
      }}
    />
  )
}
