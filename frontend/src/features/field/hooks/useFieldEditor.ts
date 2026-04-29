import { useState, useCallback } from 'react'
import type {
  FieldShape, LatLngPoint, CanvasPoint,
  PlacedField, FieldRow, PlantInstance, PlantingEvent
} from '../types'
import { todayISO } from '../types'
import {
  canvasToLatlng, latlngToCanvas,
  calculateRowPlantPositions,
  CANVAS_W, CANVAS_H,
} from '../utils/canvasGeo'
import type { BBox } from '../utils/canvasGeo'
import {
  processRowForEvents,
  processFreePlantsForEvents,
  refreshOperationStatuses,
} from '../utils/plantingEventManager'

export type EditorMode =
  | 'setup'
  | 'drawing'
  | 'complete'
  | 'addRow'
  | 'rowConfig'
  | 'addFreePlant'

export type RowDraft = {
  // Stored as canvas pixels during drawing
  startX: number
  startY: number
  endX: number
  endY: number
}

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

  const [rows, setRows] = useState<FieldRow[]>([])
  const [freePlants, setFreePlants] = useState<PlantInstance[]>([])
  const [plantingEvents, setPlantingEvents] = useState<PlantingEvent[]>([])
  const [rowDraft, setRowDraft] = useState<RowDraft | null>(null)
  const [rowStartPoint, setRowStartPoint] = useState<CanvasPoint | null>(null)
  const [selectedFreeCropId, setSelectedFreeCropId] = useState<string>('')
  const [fieldId, setFieldId] = useState<string>('')

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
    setRows(field.rows ?? [])
    setFreePlants(field.freePlants ?? [])
    setPlantingEvents(refreshOperationStatuses(field.plantingEvents ?? []))
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
    setRows([])
    setFreePlants([])
    setPlantingEvents([])
    setRowDraft(null)
    setRowStartPoint(null)
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

  const confirmRow = useCallback((row: FieldRow) => {
    setRows(prev => [...prev, row])
    setPlantingEvents(prev => processRowForEvents(prev, fieldId, row))
    setRowDraft(null)
    setMode('complete')
  }, [fieldId])

  const cancelRowConfig = useCallback(() => {
    setRowDraft(null)
    setRowStartPoint(null)
    setMode('complete')
  }, [])

  const deleteRow = useCallback((rowId: string) => {
    setRows(prev => prev.filter(r => r.id !== rowId))
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
    setFreePlants(prev => {
      setPlantingEvents(events =>
        processFreePlantsForEvents(events, fieldId, [plant], today)
      )
      return [...prev, plant]
    })
  }, [selectedFreeCropId, fieldId])

  const deleteFreePlant = useCallback((plantId: string) => {
    setFreePlants(prev => prev.filter(p => p.id !== plantId))
  }, [])

  const stopAddFreePlant = useCallback(() => {
    setSelectedFreeCropId('')
    setMode('complete')
  }, [])

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
    setPlantingEvents(prev =>
      prev.map(event =>
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
      )
    )
  }, [])

  const skipOperation = useCallback((eventId: string, operationId: string) => {
    setPlantingEvents(prev =>
      prev.map(event =>
        event.id !== eventId ? event : {
          ...event,
          operations: event.operations.map(op =>
            op.id !== operationId ? op : { ...op, status: 'skipped' as const }
          )
        }
      )
    )
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
    setRows([])
    setFreePlants([])
    setPlantingEvents([])
    setRowDraft(null)
    setRowStartPoint(null)
    setSelectedFreeCropId('')
    setFieldId('')
  }, [])

  return {
    mode, shape, name, widthFt, heightFt,
    points: canvasPoints,   // expose as 'points' for canvas compatibility
    mousePos, selectedPointIndex,
    rows, freePlants, plantingEvents, rowDraft, rowStartPoint,
    selectedFreeCropId, fieldId,
    setShape, setName, setWidthFt, setHeightFt,
    setMousePos, setSelectedPointIndex, setFieldId,
    startDrawing, addPoint, completeDrawing,
    setRectangle, undoLastPoint, clearDrawing,
    movePoint, deletePoint, loadField, reset,
    canvasPointsToLatLng,
    startAddRow, handleRowClick, confirmRow,
    cancelRowConfig, deleteRow,
    startAddFreePlant, placeFreePlant,
    deleteFreePlant, stopAddFreePlant,
    completeOperation, skipOperation,
  }
}