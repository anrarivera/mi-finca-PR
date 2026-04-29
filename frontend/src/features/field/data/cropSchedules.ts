export type RecommendedOperationType =
  | 'fertilization'
  | 'spray'
  | 'cultivation'
  | 'irrigation'
  | 'monitoring'
  | 'harvest'

export type RecommendedOperationTemplate = {
  id: string
  type: RecommendedOperationType
  label: string
  labelEs: string
  offsetDays: number        // days after planting date
  notes?: string
  notesEs?: string
  product?: string          // suggested product if applicable
}

export type CropSchedule = {
  cropTypeId: string
  harvestWindowStartDays: number
  harvestWindowEndDays: number
  operations: RecommendedOperationTemplate[]
}

export const CROP_SCHEDULES: CropSchedule[] = [
  {
    cropTypeId: 'plantain',
    harvestWindowStartDays: 270,
    harvestWindowEndDays: 365,
    operations: [
      { id: 'plt_fert_1', type: 'fertilization', label: 'First fertilization (nitrogen)', labelEs: 'Primera fertilización (nitrógeno)', offsetDays: 14, notesEs: 'Aplicar fertilizante nitrogenado para estimular crecimiento inicial' },
      { id: 'plt_cult_1', type: 'cultivation', label: 'First cultivation / weed control', labelEs: 'Primera cultivación / control de maleza', offsetDays: 30 },
      { id: 'plt_fert_2', type: 'fertilization', label: 'Second fertilization', labelEs: 'Segunda fertilización', offsetDays: 60 },
      { id: 'plt_spray_1', type: 'spray', label: 'Pest monitoring and spray if needed', labelEs: 'Monitoreo de plagas y fumigación si necesario', offsetDays: 90 },
      { id: 'plt_fert_3', type: 'fertilization', label: 'Third fertilization', labelEs: 'Tercera fertilización', offsetDays: 120 },
      { id: 'plt_cult_2', type: 'cultivation', label: 'Second cultivation', labelEs: 'Segunda cultivación', offsetDays: 150 },
      { id: 'plt_mon_1', type: 'monitoring', label: 'Monitor for flowering', labelEs: 'Monitorear floración', offsetDays: 180 },
      { id: 'plt_fert_4', type: 'fertilization', label: 'Fourth fertilization (potassium)', labelEs: 'Cuarta fertilización (potasio)', offsetDays: 210, notesEs: 'Potasio para mejorar calidad del fruto' },
      { id: 'plt_harv_1', type: 'harvest', label: 'Harvest window opens', labelEs: 'Ventana de cosecha abre', offsetDays: 270 },
    ],
  },
  {
    cropTypeId: 'banana',
    harvestWindowStartDays: 240,
    harvestWindowEndDays: 330,
    operations: [
      { id: 'ban_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 14 },
      { id: 'ban_cult_1', type: 'cultivation', labelEs: 'Primera cultivación', label: 'First cultivation', offsetDays: 30 },
      { id: 'ban_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 60 },
      { id: 'ban_fert_3', type: 'fertilization', labelEs: 'Tercera fertilización', label: 'Third fertilization', offsetDays: 120 },
      { id: 'ban_mon_1', type: 'monitoring', labelEs: 'Monitorear floración', label: 'Monitor for flowering', offsetDays: 180 },
      { id: 'ban_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 240 },
    ],
  },
  {
    cropTypeId: 'pineapple',
    harvestWindowStartDays: 540,
    harvestWindowEndDays: 730,
    operations: [
      { id: 'pin_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 30 },
      { id: 'pin_cult_1', type: 'cultivation', labelEs: 'Control de maleza', label: 'Weed control', offsetDays: 45 },
      { id: 'pin_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 90 },
      { id: 'pin_spray_1', type: 'spray', labelEs: 'Control de cochinilla', label: 'Mealybug control', offsetDays: 120 },
      { id: 'pin_fert_3', type: 'fertilization', labelEs: 'Tercera fertilización', label: 'Third fertilization', offsetDays: 180 },
      { id: 'pin_fert_4', type: 'fertilization', labelEs: 'Cuarta fertilización', label: 'Fourth fertilization', offsetDays: 270 },
      { id: 'pin_mon_1', type: 'monitoring', labelEs: 'Monitorear inducción floral', label: 'Monitor for flower induction', offsetDays: 360 },
      { id: 'pin_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 540 },
    ],
  },
  {
    cropTypeId: 'orange',
    harvestWindowStartDays: 365,
    harvestWindowEndDays: 730,
    operations: [
      { id: 'org_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 30 },
      { id: 'org_spray_1', type: 'spray', labelEs: 'Fumigación preventiva', label: 'Preventive spray', offsetDays: 60 },
      { id: 'org_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 120 },
      { id: 'org_cult_1', type: 'cultivation', labelEs: 'Poda de formación', label: 'Formative pruning', offsetDays: 180 },
      { id: 'org_fert_3', type: 'fertilization', labelEs: 'Tercera fertilización', label: 'Third fertilization', offsetDays: 240 },
      { id: 'org_mon_1', type: 'monitoring', labelEs: 'Monitorear floración', label: 'Monitor flowering', offsetDays: 300 },
      { id: 'org_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 365 },
    ],
  },
  {
    cropTypeId: 'dragon_fruit',
    harvestWindowStartDays: 365,
    harvestWindowEndDays: 545,
    operations: [
      { id: 'drf_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 30 },
      { id: 'drf_irr_1', type: 'irrigation', labelEs: 'Verificar sistema de riego', label: 'Check irrigation system', offsetDays: 45 },
      { id: 'drf_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 90 },
      { id: 'drf_cult_1', type: 'cultivation', labelEs: 'Poda y amarre', label: 'Pruning and training', offsetDays: 120 },
      { id: 'drf_fert_3', type: 'fertilization', labelEs: 'Tercera fertilización', label: 'Third fertilization', offsetDays: 180 },
      { id: 'drf_mon_1', type: 'monitoring', labelEs: 'Monitorear floración nocturna', label: 'Monitor night blooming', offsetDays: 270 },
      { id: 'drf_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 365 },
    ],
  },
  {
    cropTypeId: 'coffee',
    harvestWindowStartDays: 1095,
    harvestWindowEndDays: 1460,
    operations: [
      { id: 'cof_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 60 },
      { id: 'cof_cult_1', type: 'cultivation', labelEs: 'Control de maleza', label: 'Weed control', offsetDays: 90 },
      { id: 'cof_spray_1', type: 'spray', labelEs: 'Control de broca', label: 'Coffee berry borer control', offsetDays: 180 },
      { id: 'cof_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 240 },
      { id: 'cof_cult_2', type: 'cultivation', labelEs: 'Poda', label: 'Pruning', offsetDays: 365 },
      { id: 'cof_fert_3', type: 'fertilization', labelEs: 'Tercera fertilización', label: 'Third fertilization', offsetDays: 540 },
      { id: 'cof_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 1095 },
    ],
  },
  {
    cropTypeId: 'mango',
    harvestWindowStartDays: 1095,
    harvestWindowEndDays: 1460,
    operations: [
      { id: 'mng_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 30 },
      { id: 'mng_cult_1', type: 'cultivation', labelEs: 'Poda de formación', label: 'Formative pruning', offsetDays: 90 },
      { id: 'mng_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 180 },
      { id: 'mng_spray_1', type: 'spray', labelEs: 'Control preventivo de antracnosis', label: 'Anthracnose prevention spray', offsetDays: 270 },
      { id: 'mng_fert_3', type: 'fertilization', labelEs: 'Tercera fertilización', label: 'Third fertilization', offsetDays: 365 },
      { id: 'mng_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 1095 },
    ],
  },
  {
    cropTypeId: 'yuca',
    harvestWindowStartDays: 270,
    harvestWindowEndDays: 365,
    operations: [
      { id: 'yuc_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 30 },
      { id: 'yuc_cult_1', type: 'cultivation', labelEs: 'Control de maleza', label: 'Weed control', offsetDays: 60 },
      { id: 'yuc_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 120 },
      { id: 'yuc_cult_2', type: 'cultivation', labelEs: 'Segunda cultivación', label: 'Second cultivation', offsetDays: 180 },
      { id: 'yuc_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 270 },
    ],
  },
  {
    cropTypeId: 'tomato',
    harvestWindowStartDays: 70,
    harvestWindowEndDays: 120,
    operations: [
      { id: 'tom_fert_1', type: 'fertilization', labelEs: 'Primera fertilización', label: 'First fertilization', offsetDays: 14 },
      { id: 'tom_spray_1', type: 'spray', labelEs: 'Control preventivo de hongos', label: 'Preventive fungicide', offsetDays: 21 },
      { id: 'tom_fert_2', type: 'fertilization', labelEs: 'Segunda fertilización', label: 'Second fertilization', offsetDays: 35 },
      { id: 'tom_cult_1', type: 'cultivation', labelEs: 'Amarre y poda de chupones', label: 'Staking and sucker removal', offsetDays: 45 },
      { id: 'tom_spray_2', type: 'spray', labelEs: 'Segunda fumigación', label: 'Second spray', offsetDays: 50 },
      { id: 'tom_mon_1', type: 'monitoring', labelEs: 'Monitorear floración', label: 'Monitor flowering', offsetDays: 55 },
      { id: 'tom_harv_1', type: 'harvest', labelEs: 'Ventana de cosecha abre', label: 'Harvest window opens', offsetDays: 70 },
    ],
  },
]

export function getScheduleForCrop(cropTypeId: string): CropSchedule | undefined {
  return CROP_SCHEDULES.find(s => s.cropTypeId === cropTypeId)
}