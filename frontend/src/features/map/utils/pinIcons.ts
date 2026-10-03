// Markup for the map's name pins. Leaflet's divIcon takes an HTML string
// and assigns it with innerHTML, so everything that comes from a record —
// a farm or field name, a field color — is text typed by someone on the
// farm's team and must be made inert before it goes in. A field named
// `<img src=x onerror=…>` would otherwise run in the browser of everyone
// who opens that farm's map.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])
}

// The color goes inside style="" and an SVG attribute, where escaping
// alone would still let a value add CSS declarations of its own. Only
// what a color looks like passes; anything else paints neutral gray.
const CSS_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/]+\))$/i
const FALLBACK_COLOR = '#6b7280'

export function safeCssColor(color: string): string {
  return CSS_COLOR.test(color) ? color : FALLBACK_COLOR
}

// Pin for a field: white label with the field's color as border, over a
// pin in that color.
export function fieldPinHtml(color: string, name: string): string {
  const c = safeCssColor(color)
  return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
        <div style="background:white;border:1.5px solid ${c};color:#2d4a1e;font-size:10px;
          font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;
          box-shadow:0 1px 4px rgba(0,0,0,0.15);font-family:system-ui,sans-serif;
          max-width:120px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z"
            fill="${c}" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="4" fill="white"/>
        </svg>
      </div>
    `
}

// Pin for a non-active farm: same pin shape as the field pins, in the
// app's dark farm green.
export function farmPinHtml(name: string): string {
  return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
        <div style="background:#2d4a1e;border:1.5px solid #d4e8b0;color:#d4e8b0;font-size:10px;
          font-weight:600;padding:2px 7px;border-radius:4px;white-space:nowrap;
          box-shadow:0 1px 4px rgba(0,0,0,0.25);font-family:system-ui,sans-serif;
          max-width:140px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>
        <svg width="28" height="36" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z"
            fill="#2d4a1e" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="4" fill="#d4e8b0"/>
        </svg>
      </div>
    `
}
