import { beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'

// Deep mock of the Prisma client shared by every test file. Test files
// alias it over the real client with:
//
//   vi.mock('../lib/prisma', async () => {
//     const { prismaMock } = await import('../test/mockPrisma')
//     return { prisma: prismaMock }
//   })
//
// and then stub calls: prismaMock.user.findUnique.mockResolvedValue(...)

export const prismaMock = mockDeep<PrismaClient>()

beforeEach(() => {
  mockReset(prismaMock)
})
