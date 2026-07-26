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
        ...(schedule ? {
          schedule: {
            create: {
              harvestWindowStartDays: schedule.harvestWindowStartDays,
              harvestWindowEndDays: schedule.harvestWindowEndDays,
              operations: schedule.operations,
            },
          },
        } : {}),
      },
      include: { schedule: true },
    })

    console.log(`  ✓ ${crop.nameEs}${schedule ? ' (con calendario)' : ''}`)
  }

  console.log(`\n✅ Seeded ${cropsData.crops.length} crops`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())