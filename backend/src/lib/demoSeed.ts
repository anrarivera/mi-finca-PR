import { prisma } from './prisma'
import { calculateAreaAcres } from './farmUtils'

// ──────────────────────────────────────────────────────────────────────────
// Demo-account seeding: a realistic finca in Utuado with enough life in it
// for the guided tour to point at real things — plátanos with an OVERDUE
// labor (the check-off hook), café with history, an open finding, a
// gallinero with production, and revenue in the ledger. All dates are
// relative to "now" so the demo never rots the way fixture dates do.
// ──────────────────────────────────────────────────────────────────────────

const day = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * day)
const daysFromNow = (n: number) => new Date(Date.now() + n * day)

type Pt = { lat: number; lng: number }

// Evenly spaced plants along a row segment.
function plantsAlong(rowId: string, start: Pt, end: Pt, count: number, cropTypeId: string, plantingDate: Date, idPrefix: string) {
  const pts = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    pts.push({
      id: `${idPrefix}_p${i}`,
      cropTypeId,
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t,
      plantingDate,
    })
  }
  return pts
}

export async function seedDemoFarm(userId: string): Promise<string> {
  const uid = userId.slice(0, 8)

  // Farm boundary — a ~50-acre finca in the hills outside Utuado.
  const boundary: Pt[] = [
    { lat: 18.2580, lng: -66.7120 },
    { lat: 18.2625, lng: -66.7120 },
    { lat: 18.2625, lng: -66.7065 },
    { lat: 18.2580, lng: -66.7065 },
  ]

  const farm = await prisma.farm.create({
    data: {
      userId,
      name: 'Finca Demostración',
      location: 'Utuado, PR',
      farmType: 'mixed',
      boundary: boundary as object[],
      totalAreaAcres: calculateAreaAcres(boundary),
      isFavorite: true,
      description: 'Finca de ejemplo — explora sin miedo, nada aquí es permanente.',
    },
  })

  // ── Field 1: Los Plátanos (planted 3 weeks ago; one labor OVERDUE) ──
  const platanoPlanted = daysAgo(21)
  const f1 = await prisma.field.create({
    data: {
      farmId: farm.id,
      name: 'Los Plátanos',
      kind: 'crops',
      color: '#8fba4e',
      shape: 'polygon',
      boundary: [
        { lat: 18.2586, lng: -66.7114 },
        { lat: 18.2605, lng: -66.7114 },
        { lat: 18.2605, lng: -66.7092 },
        { lat: 18.2586, lng: -66.7092 },
      ] as object[],
      farmLat: 18.2596,
      farmLng: -66.7103,
      displayMode: 'shape',
    },
  })
  const f1EventId = `pe_demo_${uid}_platano`
  await prisma.plantingEvent.create({
    data: {
      id: f1EventId,
      fieldId: f1.id,
      cropTypeId: 'plantain',
      plantingDate: platanoPlanted,
      plantCount: 72,
      recommended: {
        create: [
          // Completed a week after planting (history for the cuaderno)…
          { id: `ro_demo_${uid}_p1`, templateId: 'cultivation-1', type: 'cultivation',
            labelEs: 'Primera cultivación / control de maleza',
            recommendedDate: daysAgo(14), status: 'completed', completedDate: daysAgo(13) },
          // …one OVERDUE (the tour's check-off hook)…
          { id: `ro_demo_${uid}_p2`, templateId: 'fertilization-1', type: 'fertilization',
            labelEs: 'Primera fertilización (nitrógeno)',
            recommendedDate: daysAgo(7), status: 'due' },
          // …one inside the due-soon window, and the future tail.
          { id: `ro_demo_${uid}_p3`, templateId: 'cultivation-2', type: 'cultivation',
            labelEs: 'Segunda cultivación', recommendedDate: daysFromNow(9), status: 'pending' },
          { id: `ro_demo_${uid}_p4`, templateId: 'fertilization-2', type: 'fertilization',
            labelEs: 'Segunda fertilización', recommendedDate: daysFromNow(39), status: 'pending' },
          { id: `ro_demo_${uid}_p5`, templateId: 'harvest-window', type: 'harvest',
            labelEs: 'Ventana de cosecha abre', recommendedDate: daysFromNow(219), status: 'pending' },
        ],
      },
    },
  })
  // 6 rows × 12 plátanos
  for (let r = 0; r < 6; r++) {
    const lat = 18.2589 + r * 0.00028
    const rowId = `row_demo_${uid}_pl${r}`
    await prisma.fieldRow.create({
      data: {
        id: rowId,
        fieldId: f1.id,
        startLat: lat, startLng: -66.7112,
        endLat: lat, endLng: -66.7094,
        spacingFt: 8,
        primaryCropTypeId: 'plantain',
        plantingDate: platanoPlanted,
        plants: {
          create: plantsAlong(rowId, { lat, lng: -66.7112 }, { lat, lng: -66.7094 }, 12,
            'plantain', platanoPlanted, rowId).map(p => ({ ...p, fieldId: f1.id, plantingEventId: f1EventId })),
        },
      },
    })
  }

  // The completed cultivación also exists in the operations log (history).
  await prisma.operation.create({
    data: {
      farmId: farm.id,
      fieldId: f1.id,
      plantingEventId: f1EventId,
      recommendedOperationId: `ro_demo_${uid}_p1`,
      type: 'cultivation',
      actualDate: daysAgo(13),
      notes: 'Deshierbe completo entre hileras',
      performedByUserId: userId,
    },
  })

  // ── Field 2: Café de Altura (10 weeks in; has an open finding) ──────
  const cafePlanted = daysAgo(70)
  const f2 = await prisma.field.create({
    data: {
      farmId: farm.id,
      name: 'Café de Altura',
      kind: 'crops',
      color: '#7a9e5f',
      shape: 'polygon',
      boundary: [
        { lat: 18.2609, lng: -66.7114 },
        { lat: 18.2621, lng: -66.7114 },
        { lat: 18.2621, lng: -66.7098 },
        { lat: 18.2609, lng: -66.7098 },
      ] as object[],
      farmLat: 18.2615,
      farmLng: -66.7106,
      displayMode: 'shape',
    },
  })
  const f2EventId = `pe_demo_${uid}_cafe`
  await prisma.plantingEvent.create({
    data: {
      id: f2EventId,
      fieldId: f2.id,
      cropTypeId: 'coffee',
      plantingDate: cafePlanted,
      plantCount: 40,
      recommended: {
        create: [
          { id: `ro_demo_${uid}_c1`, templateId: 'fertilization-1', type: 'fertilization',
            labelEs: 'Fertilización de establecimiento',
            recommendedDate: daysAgo(40), status: 'completed', completedDate: daysAgo(39) },
          { id: `ro_demo_${uid}_c2`, templateId: 'monitoring-1', type: 'monitoring',
            labelEs: 'Monitoreo de plagas', recommendedDate: daysFromNow(20), status: 'pending' },
          { id: `ro_demo_${uid}_c3`, templateId: 'fertilization-2', type: 'fertilization',
            labelEs: 'Segunda fertilización', recommendedDate: daysFromNow(50), status: 'pending' },
        ],
      },
    },
  })
  const cafeRowIds: string[] = []
  for (let r = 0; r < 4; r++) {
    const lat = 18.2611 + r * 0.00025
    const rowId = `row_demo_${uid}_cf${r}`
    cafeRowIds.push(rowId)
    await prisma.fieldRow.create({
      data: {
        id: rowId,
        fieldId: f2.id,
        startLat: lat, startLng: -66.7112,
        endLat: lat, endLng: -66.7100,
        spacingFt: 10,
        primaryCropTypeId: 'coffee',
        plantingDate: cafePlanted,
        plants: {
          create: plantsAlong(rowId, { lat, lng: -66.7112 }, { lat, lng: -66.7100 }, 10,
            'coffee', cafePlanted, rowId).map(p => ({ ...p, fieldId: f2.id, plantingEventId: f2EventId })),
        },
      },
    })
  }

  // Open finding on the café (the sanidad story: broca, moderada).
  await prisma.finding.create({
    data: {
      fieldId: f2.id,
      pestId: 'broca_cafe',
      severity: 2,
      status: 'open',
      foundDate: daysAgo(3),
      notes: 'Perforaciones en granos verdes en la hilera baja',
      rowIds: [cafeRowIds[0]],
      plantIds: [],
      performedByUserId: userId,
      observations: {
        create: [{
          date: daysAgo(3),
          severity: 2,
          rowIds: [cafeRowIds[0]],
          plantIds: [],
          notes: 'Primera observación',
          performedByUserId: userId,
        }],
      },
    },
  })

  // ── El Gallinero: corral + herd + production ────────────────────────
  const corral = await prisma.field.create({
    data: {
      farmId: farm.id,
      name: 'El Gallinero',
      kind: 'livestock',
      color: '#c4852a',
      shape: 'polygon',
      boundary: [
        { lat: 18.2586, lng: -66.7086 },
        { lat: 18.2594, lng: -66.7086 },
        { lat: 18.2594, lng: -66.7076 },
        { lat: 18.2586, lng: -66.7076 },
      ] as object[],
      farmLat: 18.2590,
      farmLng: -66.7081,
      displayMode: 'shape',
    },
  })
  const herd = await prisma.livestockUnit.create({
    data: {
      farmId: farm.id,
      fieldId: corral.id,
      name: 'Gallinas Ponedoras',
      animalType: 'chickens',
      currentCount: 12,
      acquisitionDate: daysAgo(120),
    },
  })

  // Production ledger: eggs (with revenue) and a plátano sale.
  await prisma.harvestYield.createMany({
    data: [
      { farmId: farm.id, livestockUnitId: herd.id, productId: 'eggs',
        quantity: 24, unit: 'unidades', revenue: 12, harvestDate: daysAgo(2),
        notes: 'Venta en la placita' },
      { farmId: farm.id, livestockUnitId: herd.id, productId: 'eggs',
        quantity: 18, unit: 'unidades', harvestDate: daysAgo(9) },
      { farmId: farm.id, fieldId: f1.id, cropTypeId: 'plantain',
        quantity: 120, unit: 'lb', revenue: 96, harvestDate: daysAgo(5),
        notes: 'Racimo de la siembra anterior' },
    ],
  })

  return farm.id
}
