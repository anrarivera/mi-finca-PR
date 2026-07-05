import { useState, useCallback } from 'react'
import type {
  FieldShape, LatLngPoint, CanvasPoint,
  PlacedField, FieldRow, PlantInstance, PlantingEvent
} from '../types'
import { todayISO } from '../types'
import {
  canvasToLatlng, latlngToCanvas,
  // Claude: removed unused `calculateRowPlantPositions`, `CANVAS_W`, `CANVAS_H` (TS6133 cleanup)
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
  | 'fillRows' // Added by Claude — multi-row "fill the field" mode

export type RowDraft = {
  // Stored as canvas pixels during drawing
  startX: number
  startY: number
  endX: number
  endY: number
}

// Rows, free plants, and planting events must always agree (events are
// derived from the plants), so they live in ONE state slice and every
// mutation updates all of them in a single pure functional set — atomic,
// StrictMode-safe, and immune to stale render closures.
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
  const [widthFt, setWidthFt] = useState<number>(100)
  const [heightFt, setHeightFt] = useState<number>(100)

  // Canvas pixel points — used only during editing
  const [canvasPoints, setCanvasPoints] = useState<CanvasPoint[]>([])
  const [mousePos, setMousePos] = useState<CanvasPoint | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)

  const [planting, setPlanting] = useState<PlantingState>(EMPTY_PLANTING)
  const [rowDraft, setRowDraft] = useState<RowDraft | null>(null)
  const [rowStartPoint, setRowStartPoint] = useState<CanvasPoint | null>(null)
  const [selectedFreeCropId, setSelectedFreeCropId] = useState<string>('')
  const [fieldId, setFieldId] = useState<string>('')
  // Added by Claude — live preview of the rows the fill tool will create
  const [fillPreviewRows, setFillPreviewRows] = useState<FieldRow[]>([])

  // ── Convert canvas points to lat/lng using current bbox ───────────
  // Called on save
  function canvasPointsToLatLng(bbox: BBox): LatLngPoint[] {
    return canvasPoints.map(p => canvasToLatlng(p.x, p.y, bbox))
  }

  // ── Load existing field — convert stored lat/lng back to canvas pixels
  const loadField = useCallback((field: PlacedField, bbox: BBox) => {
    setFieldId(field.id)
    setName(field.name)
    setShape(field.shape)
    setWidthFt(field.widthFt)
    setHeightFt(field.heightFt)

    // Convert stored lat/lng boundary back to canvas pixels
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

  // ── Boundary operations ───────────────────────────────────────────
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
    setFillPreviewRows([]) // Added by Claude
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

  // ── Row operations ────────────────────────────────────────────────
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

  // Every mutation below funnels through rebuildPlantingEvents — one
  // canonical path that derives events (and their plant counts) from the
  // plants that actually exist, carrying over completed-operation history.
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

  // ── Row editing (single + bulk) ───────────────────────────────────
  // Replace edited rows by id and recompute the planting calendar. The caller
  // (RowEditPanel) regenerates each row's plants for the new crop/spacing/date
  // along its existing geometry.
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

  // Added by Claude — move a whole row (and its plants) by a lat/lng delta.
  // Plant positions don't affect the planting calendar (it groups by crop +
  // date and counts plants), so no event rebuild is needed here.
  const translateRow = useCallback((rowId: string, dLat: number, dLng: number) => {
    setPlanting(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.id !== rowId ? r : {
        ...r,
        startLat: r.startLat + dLat, startLng: r.startLng + dLng,
        endLat: r.endLat + dLat, endLng: r.endLng + dLng,
        plants: r.plants.map(p => ({ ...p, lat: p.lat + dLat, lng: p.lng + dLng })),
        // Added by Claude — contour rows carry a path that must move too
        path: r.path ? r.path.map(p => ({ lat: p.lat + dLat, lng: p.lng + dLng })) : undefined,
      }),
    }))
  }, [])

  // Delete one or many rows at once and recompute events.
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

  // ── Multi-row fill operations ─────────────────────────────────────
  // Added by Claude — the fill tool generates many parallel rows at once.
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

  // ── Free plant operations ─────────────────────────────────────────
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

  // ── Single-plant operations (canvas click → select a plant) ───────
  // Delete or recrop one plant, whether it lives in a row or is a free plant.
  // Events are rebuilt so counts/calendar stay accurate.
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

  // ── Operation management ──────────────────────────────────────────
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
    setWidthFt(100)
    setHeightFt(100)
    setShape('rectangle')
    setMousePos(null)
    setSelectedPointIndex(null)
    setPlanting(EMPTY_PLANTING)
    setRowDraft(null)
    setRowStartPoint(null)
    setSelectedFreeCropId('')
    setFieldId('')
    setFillPreviewRows([]) // Added by Claude
  }, [])

  return {
    mode, shape, name, widthFt, heightFt,
    points: canvasPoints,   // expose as 'points' for canvas compatibility
    mousePos, selectedPointIndex,
    rows: planting.rows,
    freePlants: planting.freePlants,
    plantingEvents: planting.plantingEvents,
    rowDraft, rowStartPoint,
    selectedFreeCropId, fieldId,
    setShape, setName, setWidthFt, setHeightFt,
    setMousePos, setSelectedPointIndex, setFieldId,
    startDrawing, addPoint, completeDrawing,
    setRectangle, undoLastPoint, clearDrawing,
    movePoint, deletePoint, loadField, reset,
    canvasPointsToLatLng,
    startAddRow, handleRowClick, confirmRow,
    cancelRowConfig, deleteRow,
    applyRowEdits, deleteRows, translateRow, // Added by Claude — row editing + move
    startAddFreePlant, placeFreePlant,
    deleteFreePlant, stopAddFreePlant,
    deletePlantById, updatePlantCrop, // Added by Claude — single-plant edit/delete
    completeOperation, skipOperation,
    // Added by Claude — multi-row fill tool
    fillPreviewRows, setFillPreviewRows,
    startFillRows, confirmFillRows, cancelFillRows,
  }
}