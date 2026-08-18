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

    // Seeded schedules live as authorless SYSTEM recipes — one row per
    // crop, refreshed on every seed run. R1 applies to the seed too: a
    // referenced current version is frozen, so a changed crops.json mints
    // the next version instead of rewriting anyone's evidence.
    if (schedule) {
      let recipe = await prisma.recipe.findFirst({
        where: { cropTypeId: crop.id, authorUserId: null },
      })
      if (!recipe) {
        recipe = await prisma.recipe.create({
          data: {
            cropTypeId: crop.id,
            authorUserId: null,
            name: 'Calendario base',
            visibility: 'public',
          },
        })
      }

      const data = {
        harvestWindowStartDays: schedule.harvestWindowStartDays,
        harvestWindowEndDays: schedule.harvestWindowEndDays,
        operations: schedule.operations,
      }
      const current = await prisma.recipeVersion.findFirst({
        where: { recipeId: recipe.id },
        orderBy: { number: 'desc' },
      })
      const unchanged = current &&
        current.harvestWindowStartDays === data.harvestWindowStartDays &&
        current.harvestWindowEndDays === data.harvestWindowEndDays &&
        JSON.stringify(current.operations) === JSON.stringify(data.operations)

      if (!current) {
        await prisma.recipeVersion.create({ data: { recipeId: recipe.id, number: 1, ...data } })
      } else if (!unchanged) {
        if (current.referencedAt) {
          await prisma.recipeVersion.create({
            data: {
              recipeId: recipe.id,
              number: current.number + 1,
              note: 'Actualización del calendario base',
              ...data,
            },
          })
        } else {
          await prisma.recipeVersion.update({ where: { id: current.id }, data })
        }
      }
    }

    console.log(`  ✓ ${crop.nameEs}${schedule ? ' (con calendario)' : ''}`)
  }

  console.log(`\n✅ Seeded ${cropsData.crops.length} crops`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
