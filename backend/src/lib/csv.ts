// One CSV cell for the /export endpoints (operations, harvests, findings).

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

// Wraps in quotes when needed and doubles any embedded quotes.
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v) : neutralizeFormula(String(v))
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
