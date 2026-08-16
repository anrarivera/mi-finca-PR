// Client-side CSV download for data that already lives in the browser —
// the Siembras grid is derived client-side (inventoryBuilder) and the
// Animales list mirrors the livestock store, so neither needs a server
// round-trip. The server-backed logs (Labores/Producción/Sanidad) stream
// from their /export endpoints instead.

type CsvCell = string | number | null | undefined

function escapeCell(value: CsvCell): string {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]) {
  const text = [header, ...rows]
    .map(row => row.map(escapeCell).join(','))
    .join('\r\n')
  // The BOM makes Excel decode accented Spanish as UTF-8.
  const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
