import { request, createTestUser, createTestFarm, createTestField, cleanDatabase } from './helpers'
import { csvCell } from '../lib/csv'

beforeEach(async () => { await cleanDatabase() })

describe('csvCell', () => {
  it('writes null and undefined as empty cells', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes cells holding commas, quotes or line breaks', () => {
    expect(csvCell('uno, dos')).toBe('"uno, dos"')
    expect(csvCell('dijo "hola"')).toBe('"dijo ""hola"""')
    expect(csvCell('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"')
    expect(csvCell('línea 1\rlínea 2')).toBe('"línea 1\rlínea 2"')
  })

  it('opens a cell that starts like a formula as text', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+SUM(A1:A9)')).toBe("'+SUM(A1:A9)")
    expect(csvCell('-2+3')).toBe("'-2+3")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\t=1+1')).toBe("'\t=1+1")
    expect(csvCell('=HYPERLINK("http://example.com","ver")'))
      .toBe(`"'=HYPERLINK(""http://example.com"",""ver"")"`)
  })

  it('leaves numbers alone, negative ones included', () => {
    expect(csvCell(-3.5)).toBe('-3.5')
    expect(csvCell('-3.5')).toBe('-3.5')
    expect(csvCell('+7')).toBe('+7')
    expect(csvCell(0)).toBe('0')
  })

  it('leaves ordinary text alone', () => {
    expect(csvCell('Plátano')).toBe('Plátano')
    expect(csvCell('a = b')).toBe('a = b')
    expect(csvCell('lote-4')).toBe('lote-4')
  })
})

describe('CSV exports neutralize formulas typed into the records', () => {
  it('operations export', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id, { name: '@SUM(1+1)' })
    await request
      .post(`/api/v1/farms/${farm.id}/operations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'fertilization', actualDate: '2026-07-15', fieldId: field.id,
        product: '+cmd|calc', notes: '=HYPERLINK("http://example.com","ver")',
      })

    const res = await request
      .get(`/api/v1/farms/${farm.id}/operations/export?format=csv`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const [, line] = res.text.split('\n')
    expect(line).toContain(",'@SUM(1+1),")
    expect(line).toContain(",'+cmd|calc,")
    expect(line).toContain(`,"'=HYPERLINK(""http://example.com"",""ver"")"`)
  })

  it('harvests export, keeping the quantity a number', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    await request
      .post(`/api/v1/farms/${farm.id}/harvests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cropTypeId: 'platano', quantity: 40, unit: 'lb', harvestDate: '2026-07-20', notes: '=1+1' })

    const res = await request
      .get(`/api/v1/farms/${farm.id}/harvests/export?format=csv`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const [, line] = res.text.split('\n')
    expect(line).toContain(',40,lb,')
    expect(line.endsWith(",'=1+1")).toBe(true)
  })

  it('findings export', async () => {
    const { token } = await createTestUser()
    const farm = await createTestFarm(token)
    const field = await createTestField(token, farm.id)
    await request
      .post(`/api/v1/farms/${farm.id}/findings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fieldId: field.id, pestId: 'pulgones', severity: 2, notes: '-2+3' })

    const res = await request
      .get(`/api/v1/farms/${farm.id}/findings/export?format=csv`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const [, line] = res.text.split('\n')
    expect(line.endsWith(",'-2+3")).toBe(true)
  })
})
