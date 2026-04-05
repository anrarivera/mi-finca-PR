import { useState, useCallback } from 'react'
import type { FieldShape, FieldPoint, PlacedField, FieldRow, PlantInstance } from '../types'

export type EditorMode =
  | 'setup'
  | 'drawing'
  | 'complete'
  | 'addRow'
  | 'rowConfig'
  | 'addFreePlant'
  | 'editBoundary'

export type RowDraft = {
  startX: number
  startY: number
  endX: number
  endY: number
}

const CANVAS_W = 800
const CANVAS_H = 600

export function useFieldEditor() {
  // ── Boundary state ────────────────────────────────────────────────
  const [mode, setMode] = useState<EditorMode>('setup')
  const [shape, setShape] = useState<FieldShape>('rectangle')
  const [name, setName] = useState('')
  const [widthFt, setWidthFt] = useState<number>(100)
  const [heightFt, setHeightFt] = useState<number>(100)
  const [points, setPoints] = useState<FieldPoint[]>([])
  const [mousePos, setMousePos] = useState<FieldPoint | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)

  // ── Crop state ────────────────────────────────────────────────────
  const [rows, setRows] = useState<FieldRow[]>([])
  const [freePlants, setFreePlants] = useState<PlantInstance[]>([])
  const [rowDraft, setRowDraft] = useState<RowDraft | null>(null)
  const [rowStartPoint, setRowStartPoint] = useState<FieldPoint | null>(null)
  const [selectedFreeCropId, setSelectedFreeCropId] = useState<string>('')

  // ── Load existing field ───────────────────────────────────────────
  const loadField = useCallback((field: PlacedField) => {
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
    setMode('complete')
    setSelectedPointIndex(null)
    setMousePos(null)
    setRowDraft(null)
    setRowStartPoint(null)
  }, [])

  // ── Boundary operations ───────────────────────────────────────────
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
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
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
      // First click — record start point
      setRowStartPoint(point)
    } else {
      // Second click — complete the draft
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
    setRowDraft(null)
    setMode('complete')
  }, [])

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

  const placeFreePlant = useCallback((point: FieldPoint) => {
    if (!selectedFreeCropId) return
    const plant: PlantInstance = {
      id: `free_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      cropTypeId: selectedFreeCropId,
      x: point.x / CANVAS_W,
      y: point.y / CANVAS_H,
    }
    setFreePlants(prev => [...prev, plant])
  }, [selectedFreeCropId])

  const deleteFreePlant = useCallback((plantId: string) => {
    setFreePlants(prev => prev.filter(p => p.id !== plantId))
  }, [])

  const stopAddFreePlant = useCallback(() => {
    setSelectedFreeCropId('')
    setMode('complete')
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
    setRowDraft(null)
    setRowStartPoint(null)
    setSelectedFreeCropId('')
  }, [])

  return {
    // Boundary
    mode, shape, name, widthFt, heightFt,
    points, mousePos, selectedPointIndex,
    setShape, setName, setWidthFt, setHeightFt,
    setMousePos, setSelectedPointIndex,
    startDrawing, addPoint, completeDrawing,
    setRectangle, undoLastPoint, clearDrawing,
    movePoint, deletePoint, loadField, reset,
    // Rows
    rows, rowDraft, rowStartPoint,
    startAddRow, handleRowClick, confirmRow,
    cancelRowConfig, deleteRow,
    // Free plants
    freePlants, selectedFreeCropId,
    startAddFreePlant, placeFreePlant,
    deleteFreePlant, stopAddFreePlant,
  }
}