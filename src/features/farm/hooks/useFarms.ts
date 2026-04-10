import { useQuery } from '@tanstack/react-query'
import type { Farm } from '@/store/useFarmStore'

// Re-export so existing imports don't break
export type { Farm }

// ─── Mock data — replace with real API call when backend is ready ───
const mockFarms: Farm[] = []
// To test the "has farms" view, add a farm object here like:
// const mockFarms: Farm[] = [{
//   id: 'farm_1',
//   name: 'Finca Rivera',
//   location: 'Cidra, PR',
//   totalFields: 2,
//   totalCrops: 6,
//   totalAreaAcres: 1.5,
//   createdAt: '2026-01-15',
// }]

async function fetchFarms(): Promise<Farm[]> {
  // Future: return fetch('/api/farms').then(r => r.json())
  return new Promise((resolve) => setTimeout(() => resolve(mockFarms), 500))
}

export function useFarms() {
  return useQuery({
    queryKey: ['farms'],
    queryFn: fetchFarms,
  })
}