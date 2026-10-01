import type * as L from 'leaflet'

// Press-drag for map overlay elements using pointer events, so one code
// path serves mouse, touch, and pen. Movement beyond a small threshold is
// a drag (onMove fires with the latlng under the pointer); release without
// movement is a tap (onTap). Map panning is suspended for the gesture.
export function attachPointerDrag(
  el: HTMLElement,
  map: L.Map,
  handlers: {
    onMove: (latlng: L.LatLng) => void
    onTap?: () => void
    thresholdPx?: number
  }
): () => void {
  // touch-action:none is what keeps pointermove firing on touch — without
  // it the browser claims the gesture for scrolling and sends pointercancel.
  const prevTouchAction = el.style.touchAction
  el.style.touchAction = 'none'

  function onPointerDown(e: PointerEvent) {
    if (!e.isPrimary) return
    e.stopPropagation()
    e.preventDefault()
    map.dragging.disable()
    // Capture retargets all further events for this pointer to el, so the
    // drag keeps tracking even when the finger leaves the tiny marker.
    el.setPointerCapture?.(e.pointerId)

    const threshold = handlers.thresholdPx ?? 4
    const start = { x: e.clientX, y: e.clientY }
    let dragging = false

    function onPointerMove(ev: PointerEvent) {
      if (!ev.isPrimary) return
      if (!dragging) {
        const dx = Math.abs(ev.clientX - start.x)
        const dy = Math.abs(ev.clientY - start.y)
        if (dx <= threshold && dy <= threshold) return
        dragging = true
      }
      const containerPoint = map.mouseEventToContainerPoint(ev)
      handlers.onMove(map.containerPointToLatLng(containerPoint))
    }

    function onPointerEnd(ev: PointerEvent) {
      if (!ev.isPrimary) return
      map.dragging.enable()
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerEnd)
      el.removeEventListener('pointercancel', onPointerEnd)
      // pointercancel (e.g. an OS gesture stole the pointer) is not a tap
      if (!dragging && ev.type === 'pointerup') handlers.onTap?.()
    }

    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerEnd)
    el.addEventListener('pointercancel', onPointerEnd)
  }

  el.addEventListener('pointerdown', onPointerDown)
  return () => {
    el.removeEventListener('pointerdown', onPointerDown)
    el.style.touchAction = prevTouchAction
  }
}
