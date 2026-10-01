import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

// One data row, returned without the header line.
function row(...cells: Array<string | number | null | undefined>): string {
  return toCsv(['h'], [cells]).split('\r\n')[1]
}

describe('toCsv', () => {
  it('joins cells with commas and lines with CRLF', () => {
    expect(toCsv(['a', 'b'], [['1', '2'], ['3', '4']])).toBe('a,b\r\n1,2\r\n3,4')
  })

  it('quotes cells holding commas, quotes or line breaks', () => {
    expect(row('uno, dos')).toBe('"uno, dos"')
    expect(row('dijo "hola"')).toBe('"dijo ""hola"""')
    expect(row('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"')
  })

  it('writes null and undefined as empty cells', () => {
    expect(row(null, undefined, '')).toBe(',,')
  })

  it('opens a cell that starts like a formula as text', () => {
    expect(row('=1+1')).toBe("'=1+1")
    expect(row('+SUM(A1:A9)')).toBe("'+SUM(A1:A9)")
    expect(row('-2+3')).toBe("'-2+3")
    expect(row('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(row('\t=1+1')).toBe("'\t=1+1")
  })

  it('still quotes a neutralized cell that needs quoting', () => {
    expect(row('=HYPERLINK("http://example.com","ver")'))
      .toBe(`"'=HYPERLINK(""http://example.com"",""ver"")"`)
    expect(row('=cmd|a,b')).toBe(`"'=cmd|a,b"`)
  })

  it('leaves numbers alone, negative ones included', () => {
    expect(row(-3.5, 12, 0)).toBe('-3.5,12,0')
    expect(row('-3.5', '+7', '-12')).toBe('-3.5,+7,-12')
  })

  it('leaves ordinary text alone', () => {
    expect(row('Plátano', '2026-08-02', 'a = b', 'lote-4')).toBe('Plátano,2026-08-02,a = b,lote-4')
  })
})
