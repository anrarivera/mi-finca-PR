// Client-side CSV download for data that already lives in the browser —
// the Siembras grid is derived client-side (inventoryBuilder) and the
// Animales list mirrors the livestock store, so neither needs a server
// round-trip. The server-backed logs (Labores/Producción/Sanidad) stream
// from their /export endpoints instead.

export type CsvCell = string | number | null | undefined

// Excel, LibreOffice and Google Sheets run a cell that starts with one of
// these as a formula. These files go to accountants and certifiers, and
// the text in them is typed by anyone on the farm's team — so a note like
// `=HYPERLINK(...)` must open as the text it is. A leading apostrophe is
// the spreadsheet convention for "this is text". Plain numbers ("-3.5")
// are left alone: they are data, and stay summable.
const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/

function neutralizeFormula(s: string): string {
  return FORMULA_START.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s
}

function escapeCell(value: CsvCell): string {
  if (value == null) return ''
  const s = typeof value === 'number' ? String(value) : neutralizeFormula(String(value))
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows]
    .map(row => row.map(escapeCell).join(','))
    .join('\r\n')
}

export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]) {
  const text = toCsv(header, rows)
  // The BOM makes Excel decode accented Spanish as UTF-8.
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
