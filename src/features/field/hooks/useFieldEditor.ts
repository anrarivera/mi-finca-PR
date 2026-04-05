import { useState, useCallback } from 'react'
import type { FieldShape, FieldPoint, PlacedField } from '../types'

export type EditorMode = 'setup' | 'drawing' | 'complete'

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

  // ── Load an existing field into the editor ──────────────────────────
  const loadField = useCallback((field: PlacedField) => {
    setName(field.name)
    setShape(field.shape)
    setWidthFt(field.widthFt)
    setHeightFt(field.heightFt)

    // Convert normalized 0-1 points back to canvas pixel coordinates
    const pixelPoints = field.points.map(p => ({
      x: p.x * CANVAS_W,
      y: p.y * CANVAS_H,
    }))

    setPoints(pixelPoints)
    setMode('complete')
    setSelectedPointIndex(null)
    setMousePos(null)
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

  const reset = useCallback(() => {
    setMode('setup')
    setPoints([])
    setName('')
    setWidthFt(100)
    setHeightFt(100)
    setShape('rectangle')
    setMousePos(null)
    setSelectedPointIndex(null)
  }, [])

  return {
    mode, shape, name, widthFt, heightFt,
    points, mousePos, selectedPointIndex,
    setShape, setName, setWidthFt, setHeightFt,
    setMousePos, setSelectedPointIndex,
    startDrawing, addPoint, completeDrawing,
    setRectangle, undoLastPoint, clearDrawing,
    movePoint, deletePoint, reset, loadField,
  }
}