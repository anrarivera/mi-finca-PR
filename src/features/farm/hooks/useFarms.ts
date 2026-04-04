import { useQuery } from '@tanstack/react-query'

export type Farm = {
  id: string
  name: string
  location: string
  totalFields: number
  totalCrops: number
  totalAreaAcres: number
  createdAt: string
}

// ─── Mock data — replace with real API call when backend is ready ───
const mockFarms: Farm[] = []
// To test the "has farms" view, add a farm object here like:
// const mockFarms: Farm[] = [{
//   id: 'farm_1',
//   name: 'Finca Rivera',
//   location: 'Gurabo, PR',
//   totalFields: 4,
//   totalCrops: 6,
//   totalAreaAcres: 12.5,
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