/// <reference types="node" />
import { PrismaClient } from '@prisma/client'
import cropsData from './crops.json'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding built-in crops...')

  for (const crop of cropsData.crops) {
    const schedule = cropsData.schedules.find(s => s.cropTypeId === crop.id)

    await prisma.cropType.upsert({
      where: { id: crop.id },
      update: {
        name: crop.name,
        nameEs: crop.nameEs,
        emoji: crop.emoji,
        category: crop.category,
        isBuiltIn: true,
      },
      create: {
        id: crop.id,
        name: crop.name,
        nameEs: crop.nameEs,
        emoji: crop.emoji,
        category: crop.category,
        isBuiltIn: true,
        userId: null,
      },
    })

    // Sync the BASE schedule row (userId NULL) on both branches — earlier
    // seeds only wrote it on create, so re-seeding never refreshed
    // schedules. Per-user override rows are farmer data: never touched.
    if (schedule) {
      const data = {
        harvestWindowStartDays: schedule.harvestWindowStartDays,
        harvestWindowEndDays: schedule.harvestWindowEndDays,
        operations: schedule.operations,
      }
      const existing = await prisma.cropSchedule.findFirst({
        where: { cropTypeId: crop.id, userId: null },
      })
      if (existing) {
        await prisma.cropSchedule.update({ where: { id: existing.id }, data })
      } else {
        await prisma.cropSchedule.create({ data: { cropTypeId: crop.id, userId: null, ...data } })
      }
    }

    console.log(`  ✓ ${crop.nameEs}${schedule ? ' (con calendario)' : ''}`)
  }

  console.log(`\n✅ Seeded ${cropsData.crops.length} crops`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
