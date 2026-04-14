import { useState, useCallback } from 'react'
import type {
  FieldShape, FieldPoint, PlacedField,
  FieldRow, PlantInstance, PlantingEvent
} from '../types'
import { todayISO } from '../types'
import {
  processRowForEvents,
  processFreePlantsForEvents,
  refreshOperationStatuses,
} from '../utils/plantingEventManager'
import { calculateRowPlants } from '../utils/rowCalculator'

export type EditorMode =
  | 'setup'
  | 'drawing'
  | 'complete'
  | 'addRow'
  | 'rowConfig'
  | 'addFreePlant'

export type RowDraft = {
  startX: number
  startY: number
  endX: number
  endY: number
}

const CANVAS_W = 800
const CANVAS_H = 600

export function useFieldEditor() {
  const [mode, setMode] = useState<EditorMode>('setup')
  const [shape, setShape] = useState<FieldShape>('rectangle')
  const [name, setName] = useState('')
  const [widthFt, setWidthFt] = useState<number>(100)
  const [heightFt, setHeightFt] = useState<number>(100)
  const [points, setPoints] = useState<FieldPoint[]>([])
  const [mousePos, setMousePos] = useState<FieldPoint | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)
  const [rows, setRows] = useState<FieldRow[]>([])
  const [freePlants, setFreePlants] = useState<PlantInstance[]>([])
  const [plantingEvents, setPlantingEvents] = useState<PlantingEvent[]>([])
  const [rowDraft, setRowDraft] = useState<RowDraft | null>(null)
  const [rowStartPoint, setRowStartPoint] = useState<FieldPoint | null>(null)
  const [selectedFreeCropId, setSelectedFreeCropId] = useState<string>('')
  const [fieldId, setFieldId] = useState<string>('')

  const loadField = useCallback((field: PlacedField) => {
    setFieldId(field.id)
    setName(field.name)
    setShape(field.shape)
    setWidthFt(field.widthFt)
    setHeightFt(field.heightFt)
    const pixelPoints = field.points.map(p => ({
      x: p.x * CANVAS_W,
      y: p.y * CANVAS_H,
    }))
    setPoints(pixelPoints)
    setRows(field.rows ?? [])
    setFreePlants(field.freePlants ?? [])
    setPlantingEvents(refreshOperationStatuses(field.plantingEvents ?? []))
    setMode('complete')
    setSelectedPointIndex(null)
    setMousePos(null)
    setRowDraft(null)
    setRowStartPoint(null)
  }, [])

  const startDrawing = useCallback(() => {
    setMode('drawing')
    setPoints([])
    setSelectedPointIndex(null)
  }, [])

  const addPoint = useCallback((point: FieldPoint) => {
    if (shape === 'rectangle') return
    setPoints(prev => [...prev, point])
  }, [shape])

  const completeDrawing = useCallback(() => {
    setMode('complete')
    setSelectedPointIndex(null)
  }, [])

  const setRectangle = useCallback((p1: FieldPoint, p2: FieldPoint) => {
    const minX = Math.min(p1.x, p2.x)
    const maxX = Math.max(p1.x, p2.x)
    const minY = Math.min(p1.y, p2.y)
    const maxY = Math.max(p1.y, p2.y)
    setPoints([
      { x: minX, y: minY }, { x: maxX, y: minY },
      { x: maxX, y: maxY }, { x: minX, y: maxY },
    ])
    setMode('complete')
  }, [])

  const undoLastPoint = useCallback(() => {
    setPoints(prev => prev.slice(0, -1))
    if (mode === 'complete') setMode('drawing')
  }, [mode])

  const clearDrawing = useCallback(() => {
    setMode('setup')
    setPoints([])
    setSelectedPointIndex(null)
    setMousePos(null)
    setRows([])
    setFreePlants([])
    setPlantingEvents([])
    setRowDraft(null)
    setRowStartPoint(null)
  }, [])

  const movePoint = useCallback((index: number, point: FieldPoint) => {
    setPoints(prev => {
      const updated = [...prev]
      updated[index] = point
      return updated
    })
  }, [])

  const deletePoint = useCallback((index: number) => {
    setPoints(prev => {
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

  const handleRowClick = useCallback((point: FieldPoint) => {
    if (!rowStartPoint) {
      setRowStartPoint(point)
    } else {
      setRowDraft({
        startX: rowStartPoint.x / CANVAS_W,
        startY: rowStartPoint.y / CANVAS_H,
        endX: point.x / CANVAS_W,
        endY: point.y / CANVAS_H,
      })
      setRowStartPoint(null)
      setMode('rowConfig')
    }
  }, [rowStartPoint])

  const confirmRow = useCallback((row: FieldRow) => {
    setRows(prev => [...prev, row])
    // Process planting events for this row
    setPlantingEvents(prev =>
      processRowForEvents(prev, fieldId, row)
    )
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
    // Note: we keep planting events even if row is deleted
    // The farmer may have already confirmed operations against this event
  }, [])

  // ── Free plant operations ─────────────────────────────────────────
  const startAddFreePlant = useCallback((cropId: string) => {
    setSelectedFreeCropId(cropId)
    setMode('addFreePlant')
  }, [])

  const placeFreePlant = useCallback((point: FieldPoint) => {
    if (!selectedFreeCropId) return
    const today = todayISO()
    const plant: PlantInstance = {
      id: `free_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      cropTypeId: selectedFreeCropId,
      x: point.x / CANVAS_W,
      y: point.y / CANVAS_H,
      plantingDate: today,
    }
    setFreePlants(prev => {
      const updated = [...prev, plant]
      // Process planting events for this new plant
      setPlantingEvents(events =>
        processFreePlantsForEvents(events, fieldId, [plant], today)
      )
      return updated
    })
  }, [selectedFreeCropId, fieldId])

  const deleteFreePlant = useCallback((plantId: string) => {
    setFreePlants(prev => prev.filter(p => p.id !== plantId))
  }, [])

  const stopAddFreePlant = useCallback(() => {
    setSelectedFreeCropId('')
    setMode('complete')
  }, [])

  // ── Update operation status ───────────────────────────────────────
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
              completedDate: data.completedDate,
              notes: data.notes,
              product: data.product,
              quantity: data.quantity,
              unit: data.unit,
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
    setPoints([])
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
    points, mousePos, selectedPointIndex,
    rows, freePlants, plantingEvents, rowDraft, rowStartPoint,
    selectedFreeCropId, fieldId,
    setShape, setName, setWidthFt, setHeightFt,
    setMousePos, setSelectedPointIndex, setFieldId,
    startDrawing, addPoint, completeDrawing,
    setRectangle, undoLastPoint, clearDrawing,
    movePoint, deletePoint, loadField, reset,
    startAddRow, handleRowClick, confirmRow,
    cancelRowConfig, deleteRow,
    startAddFreePlant, placeFreePlant,
    deleteFreePlant, stopAddFreePlant,
    completeOperation, skipOperation,
  }
}