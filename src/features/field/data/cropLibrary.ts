export type CropType = {
  id: string
  name: string
  nameEs: string
  emoji: string
  category: string
}

export const CROP_LIBRARY: CropType[] = [
  // Musaceae
  { id: 'plantain', name: 'Plantain', nameEs: 'Plátano', emoji: '🍌', category: 'Musáceas' },
  { id: 'banana', name: 'Banana', nameEs: 'Guineo', emoji: '🍌', category: 'Musáceas' },

  // Citrus
  { id: 'orange', name: 'Orange', nameEs: 'Naranja', emoji: '🍊', category: 'Cítricos' },
  { id: 'lemon', name: 'Lemon', nameEs: 'Limón', emoji: '🍋', category: 'Cítricos' },
  { id: 'grapefruit', name: 'Grapefruit', nameEs: 'Toronja', emoji: '🍋', category: 'Cítricos' },
  { id: 'lime', name: 'Lime', nameEs: 'Lima', emoji: '🍋', category: 'Cítricos' },
  { id: 'mandarin', name: 'Mandarin', nameEs: 'Mandarina', emoji: '🍊', category: 'Cítricos' },

  // Tropical fruits
  { id: 'pineapple', name: 'Pineapple', nameEs: 'Piña', emoji: '🍍', category: 'Frutas Tropicales' },
  { id: 'dragon_fruit', name: 'Dragon Fruit', nameEs: 'Pitahaya', emoji: '🌵', category: 'Frutas Tropicales' },
  { id: 'papaya', name: 'Papaya', nameEs: 'Lechosa', emoji: '🍈', category: 'Frutas Tropicales' },
  { id: 'mango', name: 'Mango', nameEs: 'Mango', emoji: '🥭', category: 'Frutas Tropicales' },
  { id: 'avocado', name: 'Avocado', nameEs: 'Aguacate', emoji: '🥑', category: 'Frutas Tropicales' },
  { id: 'guava', name: 'Guava', nameEs: 'Guayaba', emoji: '🍏', category: 'Frutas Tropicales' },
  { id: 'passion_fruit', name: 'Passion Fruit', nameEs: 'Parcha', emoji: '🟣', category: 'Frutas Tropicales' },

  // Root vegetables (viandas)
  { id: 'yuca', name: 'Yuca', nameEs: 'Yuca', emoji: '🌿', category: 'Viandas' },
  { id: 'yautia', name: 'Yautía', nameEs: 'Yautía', emoji: '🌿', category: 'Viandas' },
  { id: 'batata', name: 'Sweet Potato', nameEs: 'Batata', emoji: '🍠', category: 'Viandas' },
  { id: 'name', name: 'Ñame', nameEs: 'Ñame', emoji: '🌿', category: 'Viandas' },
  { id: 'malanga', name: 'Malanga', nameEs: 'Malanga', emoji: '🌿', category: 'Viandas' },

  // Tree crops
  { id: 'coffee', name: 'Coffee', nameEs: 'Café', emoji: '☕', category: 'Árboles' },
  { id: 'cacao', name: 'Cacao', nameEs: 'Cacao', emoji: '🍫', category: 'Árboles' },
  { id: 'breadfruit', name: 'Breadfruit', nameEs: 'Pana', emoji: '🌳', category: 'Árboles' },
  { id: 'coconut', name: 'Coconut', nameEs: 'Coco', emoji: '🥥', category: 'Árboles' },

  // Vegetables
  { id: 'tomato', name: 'Tomato', nameEs: 'Tomate', emoji: '🍅', category: 'Vegetales' },
  { id: 'pepper', name: 'Pepper', nameEs: 'Pimiento', emoji: '🫑', category: 'Vegetales' },
  { id: 'recao', name: 'Recao', nameEs: 'Recao', emoji: '🌿', category: 'Vegetales' },
  { id: 'culantro', name: 'Culantro', nameEs: 'Culantro', emoji: '🌿', category: 'Vegetales' },

  // Companion / flowers
  { id: 'marigold', name: 'Marigold', nameEs: 'Maravilla', emoji: '🌼', category: 'Compañeras' },
  { id: 'tobacco', name: 'Tobacco', nameEs: 'Tabaco', emoji: '🌱', category: 'Compañeras' },
  { id: 'sunflower', name: 'Sunflower', nameEs: 'Girasol', emoji: '🌻', category: 'Compañeras' },
  { id: 'lavender', name: 'Lavender', nameEs: 'Lavanda', emoji: '💜', category: 'Compañeras' },
  { id: 'basil', name: 'Basil', nameEs: 'Albahaca', emoji: '🌿', category: 'Compañeras' },
]

export function getCropById(id: string): CropType | undefined {
  return CROP_LIBRARY.find(c => c.id === id)
}

export function getCropsByCategory(): Record<string, CropType[]> {
  return CROP_LIBRARY.reduce((acc, crop) => {
    if (!acc[crop.category]) acc[crop.category] = []
    acc[crop.category].push(crop)
    return acc
  }, {} as Record<string, CropType[]>)
}