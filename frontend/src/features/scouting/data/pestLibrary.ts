// ──────────────────────────────────────────────────────────────────────────
// Pest & disease library — same pattern as cropLibrary: Spanish-first names,
// emoji, and the crops each pest targets (cropLibrary ids). `crops: []`
// means the pest is generalist and applies to any crop. The picker sorts
// pests that target the field's crops first, so a plátano field suggests
// picudo and sigatoka before anything else.
// ──────────────────────────────────────────────────────────────────────────

export type PestType = {
  id: string
  name: string
  nameEs: string
  emoji: string
  category: 'Insectos' | 'Enfermedades' | 'Otros'
  /** cropLibrary ids this pest targets; empty = any crop. */
  crops: string[]
}

export const PEST_LIBRARY: PestType[] = [
  // Insectos
  { id: 'picudo_negro', name: 'Banana weevil', nameEs: 'Picudo negro', emoji: '🪲', category: 'Insectos', crops: ['plantain', 'banana'] },
  { id: 'broca_cafe', name: 'Coffee berry borer', nameEs: 'Broca del café', emoji: '🪲', category: 'Insectos', crops: ['coffee'] },
  { id: 'minador_citricos', name: 'Citrus leafminer', nameEs: 'Minador de los cítricos', emoji: '🐛', category: 'Insectos', crops: ['orange', 'lemon', 'grapefruit', 'lime', 'mandarin'] },
  { id: 'tetuan_batata', name: 'Sweet potato weevil', nameEs: 'Tetuán de la batata', emoji: '🪲', category: 'Insectos', crops: ['batata'] },
  { id: 'mosca_blanca', name: 'Whitefly', nameEs: 'Mosca blanca', emoji: '🦟', category: 'Insectos', crops: ['tomato', 'pepper', 'recao', 'culantro', 'papaya'] },
  { id: 'gusano_cogollero', name: 'Armyworm', nameEs: 'Gusano cogollero', emoji: '🐛', category: 'Insectos', crops: ['tomato', 'pepper'] },
  { id: 'afidos', name: 'Aphids', nameEs: 'Áfidos (pulgones)', emoji: '🐜', category: 'Insectos', crops: [] },
  { id: 'trips', name: 'Thrips', nameEs: 'Trips', emoji: '🦗', category: 'Insectos', crops: [] },
  { id: 'acaros', name: 'Mites', nameEs: 'Ácaros', emoji: '🕷️', category: 'Insectos', crops: [] },
  { id: 'escamas', name: 'Scale insects', nameEs: 'Escamas y cochinillas', emoji: '🐞', category: 'Insectos', crops: ['orange', 'lemon', 'grapefruit', 'lime', 'mandarin', 'mango', 'avocado'] },

  // Enfermedades
  { id: 'sigatoka', name: 'Black sigatoka', nameEs: 'Sigatoka negra', emoji: '🍂', category: 'Enfermedades', crops: ['plantain', 'banana'] },
  { id: 'roya_cafe', name: 'Coffee leaf rust', nameEs: 'Roya del café', emoji: '🍄', category: 'Enfermedades', crops: ['coffee'] },
  { id: 'hlb', name: 'Citrus greening (HLB)', nameEs: 'HLB (dragón amarillo)', emoji: '🍋', category: 'Enfermedades', crops: ['orange', 'lemon', 'grapefruit', 'lime', 'mandarin'] },
  { id: 'antracnosis', name: 'Anthracnose', nameEs: 'Antracnosis', emoji: '🟤', category: 'Enfermedades', crops: ['mango', 'avocado', 'papaya', 'guava'] },
  { id: 'mazorca_negra', name: 'Black pod rot', nameEs: 'Mazorca negra', emoji: '🍫', category: 'Enfermedades', crops: ['cacao'] },
  { id: 'tizon', name: 'Blight', nameEs: 'Tizón', emoji: '🥀', category: 'Enfermedades', crops: ['tomato', 'pepper'] },
  { id: 'pudricion_raiz', name: 'Root rot', nameEs: 'Pudrición de raíz', emoji: '🫚', category: 'Enfermedades', crops: ['yuca', 'yautia', 'batata', 'name', 'malanga'] },

  // Otros
  { id: 'babosas', name: 'Slugs & snails', nameEs: 'Babosas y caracoles', emoji: '🐌', category: 'Otros', crops: [] },
  { id: 'roedores', name: 'Rodents', nameEs: 'Roedores', emoji: '🐀', category: 'Otros', crops: [] },
  { id: 'iguanas', name: 'Iguanas', nameEs: 'Iguanas', emoji: '🦎', category: 'Otros', crops: [] },
  { id: 'malezas', name: 'Weeds', nameEs: 'Malezas', emoji: '🌾', category: 'Otros', crops: [] },
  { id: 'otro', name: 'Other', nameEs: 'Otro', emoji: '🔍', category: 'Otros', crops: [] },
]

export function getPestById(id: string): PestType | undefined {
  return PEST_LIBRARY.find(p => p.id === id)
}

// Split the library for a picker: pests targeting any of the given crops
// first ("Sugeridos para este campo"), everything else after, both keeping
// library order.
export function pestsForCrops(cropTypeIds: string[]): {
  suggested: PestType[]
  others: PestType[]
} {
  const cropSet = new Set(cropTypeIds)
  const suggested = PEST_LIBRARY.filter(p => p.crops.some(c => cropSet.has(c)))
  const suggestedIds = new Set(suggested.map(p => p.id))
  const others = PEST_LIBRARY.filter(p => !suggestedIds.has(p.id))
  return { suggested, others }
}
