import { prisma } from './helpers'

// Postgres indexes the referenced side of a foreign key (the primary key)
// but not the referencing column. Without an index there, every cascade
// from a parent row and every "children of X" list scans the whole child
// table. This guard fails when a new relation is added to schema.prisma
// without an @@index (or a unique) that leads with its column.
describe('schema indexes', () => {
  it('every foreign key column leads an index', async () => {
    const unindexed = await prisma.$queryRaw<Array<{ table: string; column: string }>>`
      SELECT c.conrelid::regclass::text AS "table", a.attname AS "column"
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND c.connamespace = 'public'::regnamespace
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
        )
      ORDER BY 1, 2
    `

    expect(unindexed).toEqual([])
  })
})
