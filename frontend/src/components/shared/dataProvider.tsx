// src/components/shared/dataProvider.tsx
import { useEffect } from 'react'
import { useFarms } from '@/features/farm/hooks/useFarmsApi'
import { useFields } from '@/features/field/hooks/useFieldsApi'
import { useFarmStore } from '@/store/useFarmStore'

export default function DataProvider({ children }: { children: React.ReactNode }) {
  const activeFarmId = useFarmStore(s => s.activeFarmId)
  
  useFarms()
  useFields(activeFarmId)

  return <>{children}</>
}