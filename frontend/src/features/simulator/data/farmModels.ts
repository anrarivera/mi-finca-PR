// Pre-built farm model templates for the viability simulator — starting
// points a farmer can load and then tweak plant counts and assumptions.

export type FarmModel = {
  id: string
  nameEs: string
  emoji: string
  descriptionEs: string
  crops: Array<{ cropTypeId: string; count: number }>
}

export const FARM_MODELS: FarmModel[] = [
  {
    id: 'platanero_1ac',
    nameEs: 'Platanera (1 acre)',
    emoji: '🍌',
    descriptionEs: 'Monocultivo clásico de plátano a 8×8 ft — unas 680 matas por acre.',
    crops: [{ cropTypeId: 'plantain', count: 680 }],
  },
  {
    id: 'huerto_familiar',
    nameEs: 'Huerto familiar mixto',
    emoji: '🥬',
    descriptionEs: 'Hortalizas y viandas para mercado local: tomate, pimiento, recao, yuca y batata.',
    crops: [
      { cropTypeId: 'tomato', count: 120 },
      { cropTypeId: 'pepper', count: 100 },
      { cropTypeId: 'recao', count: 200 },
      { cropTypeId: 'yuca', count: 300 },
      { cropTypeId: 'batata', count: 250 },
    ],
  },
  {
    id: 'cafetal_montana',
    nameEs: 'Cafetal de montaña (2 acres)',
    emoji: '☕',
    descriptionEs: 'Café bajo sombra con guineos intercalados como sombra productiva.',
    crops: [
      { cropTypeId: 'coffee', count: 1200 },
      { cropTypeId: 'banana', count: 150 },
    ],
  },
  {
    id: 'frutales_diverso',
    nameEs: 'Finca de frutales diversa',
    emoji: '🥭',
    descriptionEs: 'Frutales de alto valor a largo plazo: aguacate, mango, cítricos y pana.',
    crops: [
      { cropTypeId: 'avocado', count: 40 },
      { cropTypeId: 'mango', count: 30 },
      { cropTypeId: 'orange', count: 50 },
      { cropTypeId: 'lemon', count: 30 },
      { cropTypeId: 'breadfruit', count: 10 },
    ],
  },
  {
    id: 'agroforestal',
    nameEs: 'Sistema agroforestal',
    emoji: '🌳',
    descriptionEs: 'Capas combinadas: pana y coco arriba, cacao y café en medio, viandas abajo.',
    crops: [
      { cropTypeId: 'breadfruit', count: 15 },
      { cropTypeId: 'coconut', count: 20 },
      { cropTypeId: 'cacao', count: 200 },
      { cropTypeId: 'coffee', count: 300 },
      { cropTypeId: 'yautia', count: 400 },
    ],
  },
]
