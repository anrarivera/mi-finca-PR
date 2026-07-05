import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

// ──────────────────────────────────────────────────────────────────────────
// Seeds the crop knowledge base (issue #1). seed-data/crops.json is
// generated from the frontend's cropLibrary.ts / cropSchedules.ts so the
// database starts with exactly the crops the app ships with. Idempotent:
// upserts by id, safe to re-run after adding crops.
//
//   npx prisma db seed
// ──────────────────────────────────────────────────────────────────────────

type SeedCrop = {
  id: string
  name: string
  nameEs: string
  emoji: string
  category: string
}

type SeedSchedule = {
  cropTypeId: string
  harvestWindowStartDays: number
  harvestWindowEndDays: number
  operations: unknown[]
}

const prisma = new PrismaClient()

async function main() {
  const raw = readFileSync(join(__dirname, 'seed-data', 'crops.json'), 'utf8')
  const { crops, schedules } = JSON.parse(raw) as {
    crops: SeedCrop[]
    schedules: SeedSchedule[]
  }

  for (const crop of crops) {
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
      },
    })
  }

  for (const schedule of schedules) {
    const data = {
      harvestWindowStartDays: schedule.harvestWindowStartDays,
      harvestWindowEndDays: schedule.harvestWindowEndDays,
      operations: schedule.operations as object[],
    }
    await prisma.cropSchedule.upsert({
      where: { cropTypeId: schedule.cropTypeId },
      update: data,
      create: { cropTypeId: schedule.cropTypeId, ...data },
    })
  }

  console.log(`🌱 Seeded ${crops.length} crops and ${schedules.length} schedules`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
