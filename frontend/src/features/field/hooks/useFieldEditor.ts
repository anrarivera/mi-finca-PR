import { useState, useCallback } from 'react'
import type {
  FieldShape, LatLngPoint, CanvasPoint,
  PlacedField, FieldRow, PlantInstance, PlantingEvent
} from '../types'
import { todayISO } from '../types'
import {
  canvasToLatlng, latlngToCanvas,
} from '../utils/canvasGeo'
import type { BBox } from '../utils/canvasGeo'
import {
  refreshOperationStatuses,
  rebuildPlantingEvents,
} from '../utils/plantingEventManager'

export type EditorMode =
  | 'setup'
  | 'drawing'
  | 'complete'
  | 'addRow'
  | 'rowConfig'
  | 'addFreePlant'
  | 'fillRows'

export type RowDraft = {
  startX: number
  startY: number
  endX: number
  endY: number
}

type PlantingState = {
  rows: FieldRow[]
  freePlants: PlantInstance[]
  plantingEvents: PlantingEvent[]
}

const EMPTY_PLANTING: PlantingState = { rows: [], freePlants: [], plantingEvents: [] }

export function useFieldEditor() {
  const [mode, setMode] = useState<EditorMode>('setup')
  const [shape, setShape] = useState<FieldShape>('rectangle')
  const [name, setName] = useState('')
  // 'crops' (default) or 'livestock' — a corral, drawn the same way but
  // holding herds instead of rows/plants.
  const [kind, setKind] = useState<'crops' | 'livestock'>('crops')

  const [canvasPoints, setCanvasPoints] = useState<CanvasPoint[]>([])
  const [mousePos, setMousePos] = useState<CanvasPoint | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)

  const [planting, setPlanting] = useState<PlantingState>(EMPTY_PLANTING)
  const [rowDraft, setRowDraft] = useState<RowDraft | null>(null)
  const [rowStartPoint, setRowStartPoint] = useState<CanvasPoint | null>(null)
  const [selectedFreeCropId, setSelectedFreeCropId] = useState<string>('')
  const [fieldId, setFieldId] = useState<string>('')
  const [fillPreviewRows, setFillPreviewRows] = useState<FieldRow[]>([])

  function canvasPointsToLatLng(bbox: BBox): LatLngPoint[] {
    return canvasPoints.map(p => canvasToLatlng(p.x, p.y, bbox))
  }

  const loadField = useCallback((field: PlacedField, bbox: BBox) => {
    setFieldId(field.id)
    setName(field.name)
    setKind(field.kind ?? 'crops')
    setShape(field.shape)

    const pixelPoints = (field.boundary ?? []).map(p =>
      latlngToCanvas(p.lat, p.lng, bbox)
    )
    setCanvasPoints(pixelPoints)
    setPlanting({
      rows: field.rows ?? [],
      freePlants: field.freePlants ?? [],
      plantingEvents: refreshOperationStatuses(field.plantingEvents ?? []),
    })
    setMode('complete')
    setSelectedPointIndex(null)
    setMousePos(null)
    setRowDraft(null)
    setRowStartPoint(null)
  }, [])

  const startDrawing = useCallback(() => {
    setMode('drawing')
    setCanvasPoints([])
    setSelectedPointIndex(null)
  }, [])

  const addPoint = useCallback((point: CanvasPoint) => {
    if (shape === 'rectangle') return
    setCanvasPoints(prev => [...prev, point])
  }, [shape])

  const completeDrawing = useCallback(() => {
    setMode('complete')
    setSelectedPointIndex(null)
  }, [])

  const setRectangle = useCallback((p1: CanvasPoint, p2: CanvasPoint) => {
    const minX = Math.min(p1.x, p2.x)
    const maxX = Math.max(p1.x, p2.x)
    const minY = Math.min(p1.y, p2.y)
    const maxY = Math.max(p1.y, p2.y)
    setCanvasPoints([
      { x: minX, y: minY }, { x: maxX, y: minY },
      { x: maxX, y: maxY }, { x: minX, y: maxY },
    ])
    setMode('complete')
  }, [])

  const undoLastPoint = useCallback(() => {
    setCanvasPoints(prev => prev.slice(0, -1))
    if (mode === 'complete') setMode('drawing')
  }, [mode])

  const clearDrawing = useCallback(() => {
    setMode('setup')
    setCanvasPoints([])
    setSelectedPointIndex(null)
    setMousePos(null)
    setPlanting(EMPTY_PLANTING)
    setRowDraft(null)
    setRowStartPoint(null)
    setFillPreviewRows([])
  }, [])

  const movePoint = useCallback((index: number, point: CanvasPoint) => {
    setCanvasPoints(prev => {
      const updated = [...prev]
      updated[index] = point
      return updated
    })
  }, [])

  const deletePoint = useCallback((index: number) => {
    setCanvasPoints(prev => {
      if (prev.length <= 3) return prev
      return prev.filter((_, i) => i !== index)
    })
    setSelectedPointIndex(null)
  }, [])

  const startAddRow = useCallback(() => {
    setMode('addRow')
    setRowStartPoint(null)
    setRowDraft(null)
  }, [])

  const handleRowClick = useCallback((point: CanvasPoint) => {
    if (!rowStartPoint) {
      setRowStartPoint(point)
    } else {
      setRowDraft({
        startX: rowStartPoint.x,
        startY: rowStartPoint.y,
        endX: point.x,
        endY: point.y,
      })
      setRowStartPoint(null)
      setMode('rowConfig')
    }
  }, [rowStartPoint])

  const confirmRow = useCallback((row: FieldRow) => {
    setPlanting(prev => {
      const rows = [...prev.rows, row]
      return {
        ...prev,
        rows,
        plantingEvents: rebuildPlantingEvents(fieldId, rows, prev.freePlants, prev.plantingEvents),
      }
    })
    setRowDraft(null)
    setMode('complete')
  }, [fieldId])

  const cancelRowConfig = useCallback(() => {
    setRowDraft(null)
    setRowStartPoint(null)
    setMode('complete')
  }, [])

  const deleteRow = useCallback((rowId: string) => {
    setPlanting(prev => {
      const rows = prev.rows.filter(r => r.id !== rowId)
      return {
        ...prev,
        rows,
        plantingEvents: rebuildPlantingEvents(fieldId, rows, prev.freePlants, prev.plantingEvents),
      }
    })
  }, [fieldId])

  const applyRowEdits = useCallback((updated: FieldRow[]) => {
    if (updated.length === 0) return
    setPlanting(prev => {
      const byId = new Map(updated.map(r => [r.id, r]))
      const rows = prev.rows.map(r => byId.get(r.id) ?? r)
      return {
        ...prev,
        rows,
        plantingEvents: rebuildPlantingEvents(fieldId, rows, prev.freePlants, prev.plantingEvents),
      }
    })
  }, [fieldId])

  const translateRow = useCallback((rowId: string, dLat: number, dLng: number) => {
    setPlanting(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.id !== rowId ? r : {
        ...r,
        startLat: r.startLat + dLat, startLng: r.startLng + dLng,
        endLat: r.endLat + dLat, endLng: r.endLng + dLng,
        plants: r.plants.map(p => ({ ...p, lat: p.lat + dLat, lng: p.lng + dLng })),
        path: r.path ? r.path.map(p => ({ lat: p.lat + dLat, lng: p.lng + dLng })) : undefined,
      }),
    }))
  }, [])

  const deleteRows = useCallback((rowIds: string[]) => {
    if (rowIds.length === 0) return
    const ids = new Set(rowIds)
    setPlanting(prev => {
      const rows = prev.rows.filter(r => !ids.has(r.id))
      return {
        ...prev,
        rows,
        plantingEvents: rebuildPlantingEvents(fieldId, rows, prev.freePlants, prev.plantingEvents),
      }
    })
  }, [fieldId])

  const startFillRows = useCallback(() => {
    setMode('fillRows')
    setRowStartPoint(null)
    setRowDraft(null)
    setFillPreviewRows([])
  }, [])

  const confirmFillRows = useCallback((newRows: FieldRow[]) => {
    if (newRows.length > 0) {
      setPlanting(prev => {
        const rows = [...prev.rows, ...newRows]
        return {
          ...prev,
          rows,
          plantingEvents: rebuildPlantingEvents(fieldId, rows, prev.freePlants, prev.plantingEvents),
        }
      })
    }
    setFillPreviewRows([])
    setMode('complete')
  }, [fieldId])

  const cancelFillRows = useCallback(() => {
    setFillPreviewRows([])
    setMode('complete')
  }, [])

  const startAddFreePlant = useCallback((cropId: string) => {
    setSelectedFreeCropId(cropId)
    setMode('addFreePlant')
  }, [])

  const placeFreePlant = useCallback((point: CanvasPoint, bbox: BBox) => {
    if (!selectedFreeCropId) return
    const today = todayISO()
    const geo = canvasToLatlng(point.x, point.y, bbox)
    const plant: PlantInstance = {
      id: `free_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      cropTypeId: selectedFreeCropId,
      lat: geo.lat,
      lng: geo.lng,
      plantingDate: today,
    }
    setPlanting(prev => {
      const freePlants = [...prev.freePlants, plant]
      return {
        ...prev,
        freePlants,
        plantingEvents: rebuildPlantingEvents(fieldId, prev.rows, freePlants, prev.plantingEvents),
      }
    })
  }, [selectedFreeCropId, fieldId])

  const deleteFreePlant = useCallback((plantId: string) => {
    setPlanting(prev => {
      const freePlants = prev.freePlants.filter(p => p.id !== plantId)
      return {
        ...prev,
        freePlants,
        plantingEvents: rebuildPlantingEvents(fieldId, prev.rows, freePlants, prev.plantingEvents),
      }
    })
  }, [fieldId])

  const stopAddFreePlant = useCallback(() => {
    setSelectedFreeCropId('')
    setMode('complete')
  }, [])

  const deletePlantById = useCallback((plantId: string) => {
    setPlanting(prev => {
      const rows = prev.rows.map(r =>
        r.plants.some(p => p.id === plantId)
          ? { ...r, plants: r.plants.filter(p => p.id !== plantId) }
          : r
      )
      const freePlants = prev.freePlants.filter(p => p.id !== plantId)
      return {
        rows,
        freePlants,
        plantingEvents: rebuildPlantingEvents(fieldId, rows, freePlants, prev.plantingEvents),
      }
    })
  }, [fieldId])

  // Delete rows and individual plants in one state update (bulk selection).
  const deleteRowsAndPlants = useCallback((rowIds: string[], plantIds: string[]) => {
    if (rowIds.length === 0 && plantIds.length === 0) return
    const rowSet = new Set(rowIds)
    const plantSet = new Set(plantIds)
    setPlanting(prev => {
      const rows = prev.rows
        .filter(r => !rowSet.has(r.id))
        .map(r => r.plants.some(p => plantSet.has(p.id))
          ? { ...r, plants: r.plants.filter(p => !plantSet.has(p.id)) }
          : r
        )
      const freePlants = prev.freePlants.filter(p => !plantSet.has(p.id))
      return {
        rows,
        freePlants,
        plantingEvents: rebuildPlantingEvents(fieldId, rows, freePlants, prev.plantingEvents),
      }
    })
  }, [fieldId])

  const updatePlantCrop = useCallback((plantId: string, cropTypeId: string) => {
    setPlanting(prev => {
      const rows = prev.rows.map(r =>
        r.plants.some(p => p.id === plantId)
          ? { ...r, plants: r.plants.map(p => p.id === plantId ? { ...p, cropTypeId } : p) }
          : r
      )
      const freePlants = prev.freePlants.map(p => p.id === plantId ? { ...p, cropTypeId } : p)
      return {
        rows,
        freePlants,
        plantingEvents: rebuildPlantingEvents(fieldId, rows, freePlants, prev.plantingEvents),
      }
    })
  }, [fieldId])

  const completeOperation = useCallback((
    eventId: string,
    operationId: string,
    data: {
      completedDate: string
      notes?: string
      product?: string
      quantity?: number
      unit?: string
    }
  ) => {
    setPlanting(prev => ({
      ...prev,
      plantingEvents: prev.plantingEvents.map(event =>
        event.id !== eventId ? event : {
          ...event,
          operations: event.operations.map(op =>
            op.id !== operationId ? op : {
              ...op,
              status: 'completed' as const,
              ...data,
            }
          )
        }
      ),
    }))
  }, [])

  const skipOperation = useCallback((eventId: string, operationId: string) => {
    setPlanting(prev => ({
      ...prev,
      plantingEvents: prev.plantingEvents.map(event =>
        event.id !== eventId ? event : {
          ...event,
          operations: event.operations.map(op =>
            op.id !== operationId ? op : { ...op, status: 'skipped' as const }
          )
        }
      ),
    }))
  }, [])

  const reset = useCallback(() => {
    setMode('setup')
    setCanvasPoints([])
    setName('')
    setKind('crops')
    setShape('rectangle')
    setMousePos(null)
    setSelectedPointIndex(null)
    setPlanting(EMPTY_PLANTING)
    setRowDraft(null)
    setRowStartPoint(null)
    setSelectedFreeCropId('')
    setFieldId('')
    setFillPreviewRows([])
  }, [])

  return {
    mode, shape, name, kind,
    points: canvasPoints,
    mousePos, selectedPointIndex,
    rows: planting.rows,
    freePlants: planting.freePlants,
    plantingEvents: planting.plantingEvents,
    rowDraft, rowStartPoint,
    selectedFreeCropId, fieldId,
    setShape, setName, setKind,
    setMousePos, setSelectedPointIndex, setFieldId,
    startDrawing, addPoint, completeDrawing,
    setRectangle, undoLastPoint, clearDrawing,
    movePoint, deletePoint, loadField, reset,
    canvasPointsToLatLng,
    startAddRow, handleRowClick, confirmRow,
    cancelRowConfig, deleteRow,
    applyRowEdits, deleteRows, translateRow,
    startAddFreePlant, placeFreePlant,
    deleteFreePlant, stopAddFreePlant,
    deletePlantById, deleteRowsAndPlants, updatePlantCrop,
    completeOperation, skipOperation,
    fillPreviewRows, setFillPreviewRows,
    startFillRows, confirmFillRows, cancelFillRows,
  }
}