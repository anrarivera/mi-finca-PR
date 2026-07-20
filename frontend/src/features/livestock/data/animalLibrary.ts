import type { AnimalType } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Animal reference data for Puerto Rico small/mid-size farms. `careTasks`
// feed the rule-based recommendation engine: each task recurs every
// `intervalDays` counted from the unit's acquisition date.
// ──────────────────────────────────────────────────────────────────────────

export type CareTask = {
  id: string
  labelEs: string
  intervalDays: number
}

export type AnimalInfo = {
  id: AnimalType
  nameEs: string        // plural, e.g. "Gallinas"
  singularEs: string
  emoji: string
  productEs: string     // main product, e.g. "huevos"
  unitNamePlaceholder: string // suggested unit name in the create form
  careTasks: CareTask[]
  tipsEs: string[]
}

export const ANIMAL_LIBRARY: AnimalInfo[] = [
  {
    id: 'chickens',
    nameEs: 'Gallinas',
    singularEs: 'gallina',
    emoji: '🐔',
    productEs: 'huevos',
    unitNamePlaceholder: 'Gallinero principal',
    careTasks: [
      { id: 'coop_clean', labelEs: 'Limpieza profunda del gallinero', intervalDays: 30 },
      { id: 'deworm', labelEs: 'Desparasitación', intervalDays: 90 },
      { id: 'mite_check', labelEs: 'Revisión de ácaros y piojillos', intervalDays: 14 },
    ],
    tipsEs: [
      'En el calor del Caribe, asegura sombra y agua fresca constante — el estrés térmico baja la puesta.',
      'Recoge los huevos temprano en la mañana para evitar que se dañen con el calor.',
    ],
  },
  {
    id: 'rabbits',
    nameEs: 'Conejos',
    singularEs: 'conejo',
    emoji: '🐇',
    productEs: 'carne',
    unitNamePlaceholder: 'Conejera',
    careTasks: [
      { id: 'hutch_clean', labelEs: 'Limpieza de jaulas', intervalDays: 7 },
      { id: 'nail_teeth', labelEs: 'Revisión de uñas y dientes', intervalDays: 60 },
    ],
    tipsEs: [
      'Los conejos toleran mal el calor sobre 85°F — ubica las jaulas en sombra con buena ventilación.',
      'El estiércol de conejo se puede aplicar directo a las siembras sin compostar.',
    ],
  },
  {
    id: 'goats',
    nameEs: 'Cabras',
    singularEs: 'cabra',
    emoji: '🐐',
    productEs: 'leche',
    unitNamePlaceholder: 'Rebaño de cabras',
    careTasks: [
      { id: 'hoof_trim', labelEs: 'Recorte de pezuñas', intervalDays: 60 },
      { id: 'deworm', labelEs: 'Desparasitación (FAMACHA)', intervalDays: 45 },
      { id: 'mineral', labelEs: 'Reponer minerales', intervalDays: 30 },
    ],
    tipsEs: [
      'Rota los potreros cada 3-4 semanas para cortar el ciclo de los parásitos gastrointestinales.',
      'Las cabras son excelentes para desmontar maleza antes de preparar un campo nuevo.',
    ],
  },
  {
    id: 'cows',
    nameEs: 'Vacas',
    singularEs: 'vaca',
    emoji: '🐄',
    productEs: 'leche',
    unitNamePlaceholder: 'Ganado',
    careTasks: [
      { id: 'vacc', labelEs: 'Ciclo de vacunación', intervalDays: 180 },
      { id: 'tick_control', labelEs: 'Control de garrapatas', intervalDays: 21 },
      { id: 'hoof_check', labelEs: 'Revisión de cascos', intervalDays: 90 },
    ],
    tipsEs: [
      'En época de sequía planifica reservas de pasto o heno — el pasto tropical pierde valor nutritivo rápido.',
      'Verifica los requisitos del Departamento de Agricultura de PR para el registro de ganado.',
    ],
  },
  {
    id: 'pigs',
    nameEs: 'Cerdos',
    singularEs: 'cerdo',
    emoji: '🐖',
    productEs: 'carne',
    unitNamePlaceholder: 'Porqueriza',
    careTasks: [
      { id: 'pen_clean', labelEs: 'Limpieza de corrales', intervalDays: 7 },
      { id: 'deworm', labelEs: 'Desparasitación', intervalDays: 120 },
    ],
    tipsEs: [
      'Los cerdos necesitan lodo o rociado para regular temperatura — no sudan.',
      'Aprovecha sobras de viandas y frutas como complemento alimenticio.',
    ],
  },
  {
    id: 'bees',
    nameEs: 'Abejas',
    singularEs: 'colmena',
    emoji: '🐝',
    productEs: 'miel',
    unitNamePlaceholder: 'Apiario',
    careTasks: [
      { id: 'hive_inspect', labelEs: 'Inspección de colmenas', intervalDays: 14 },
      { id: 'varroa', labelEs: 'Monitoreo de varroa', intervalDays: 30 },
    ],
    tipsEs: [
      'La abeja de PR es mansa pero africanizada — trabaja con equipo de protección completo.',
      'Coloca las colmenas mirando al este y protegidas del viento; evita zonas de fumigación.',
    ],
  },
]

export function getAnimalById(id: string): AnimalInfo | undefined {
  return ANIMAL_LIBRARY.find(a => a.id === id)
}
