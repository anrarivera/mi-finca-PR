import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The persisted stores take hold of window.localStorage as they are
// created — so the stand-in has to be in place before any is imported.
const stored = vi.hoisted(() => {
  const items = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, String(value)) },
    removeItem: (key: string) => { items.delete(key) },
  }
  vi.stubGlobal('localStorage', localStorage)
  vi.stubGlobal('window', { localStorage })
  return items
})

import { QueryClient } from '@tanstack/react-query'
import { clearAccountData, wipeAccount } from './farmActions'
import { useFarmStore, type Farm } from './useFarmStore'
import { useFieldStore } from './useFieldStore'
import { useLivestockStore } from './useLivestockStore'
import { useCropStore } from './useCropStore'
import { useRecipeStore } from './useRecipeStore'
import { useHarvestHighlightStore } from './useHarvestHighlightStore'
import { useUnsavedWorkStore } from './useUnsavedWorkStore'
import { useSettingsStore } from './useSettingsStore'
import { useToastStore } from './useToastStore'
import { DEFAULT_NOTIFICATION_PREFS } from '@/features/notifications/notificationBuilder'
import type { PlacedField } from '@/features/field/types'
import type { LivestockUnit } from '@/features/livestock/types'

const FARM: Farm = {
  id: 'farm-a',
  name: 'Finca de A',
  location: 'Utuado',
  farmType: 'mixed',
  totalAreaAcres: 12,
  createdAt: '2026-01-01T00:00:00.000Z',
  boundary: [],
  fieldIds: ['field-a'],
  isFavorite: true,
}

// Only what the wipe looks at — the stores never inspect the rest.
const FIELD = { id: 'field-a', farmId: 'farm-a', name: 'Campo de A' } as PlacedField
const HERD = { id: 'herd-a', farmId: 'farm-a', name: 'Gallinas de A' } as LivestockUnit

const PREFS = { ...DEFAULT_NOTIFICATION_PREFS, dueSoonLeadDays: 5, notifyHarvest: false }

// Device-level keys written outside the stores (i18n, hooks/useCollapsed).
const DEVICE_KEYS = {
  'mi-finca-lang': 'en',
  'mi-finca-collapse-labores-log': '1',
  'mi-finca-collapse-labores-calendar': '0',
}

function persisted(key: string) {
  const raw = stored.get(key)
  return raw === undefined ? undefined : JSON.parse(raw).state
}

// Account A has been using this browser.
beforeEach(() => {
  stored.clear()
  for (const [key, value] of Object.entries(DEVICE_KEYS)) stored.set(key, value)

  useFarmStore.setState({
    farms: [FARM], activeFarmId: FARM.id, activeFarm: FARM, favoriteFarmId: FARM.id,
  })
  useFieldStore.setState({ fields: [FIELD] })
  useLivestockStore.getState().setUnits([HERD])
  useCropStore.setState({
    crops: [{
      id: 'crop-a', name: 'Dragon fruit', nameEs: 'Pitahaya de A', emoji: '🌵',
      category: 'Personalizados', isBuiltIn: false, userId: 'user-a',
    }],
    customCrops: [{
      crop: { id: 'legacy-a' } as never,
      schedule: null,
    }],
  })
  useRecipeStore.setState({ byFarm: {}, revision: 0 })
  useRecipeStore.getState().setResolved(FARM.id, [{
    cropTypeId: 'crop-a', fieldId: null, recipeId: 'recipe-a', recipeName: 'Receta de A',
    authorUserId: 'user-a', versionId: 'version-a', versionNumber: 1,
    harvestWindowStartDays: 90, harvestWindowEndDays: 120, operations: [],
  }])
  useHarvestHighlightStore.setState({
    highlight: { rowIds: ['row-a'], plantIds: ['plant-a'] },
    toggles: { fieldId: FIELD.id, toggleRow: () => {}, togglePlant: () => {} },
  })
  useUnsavedWorkStore.setState({ count: 2 })
  useSettingsStore.setState({
    notificationPrefs: PREFS,
    seenNotificationIds: ['op-a-1', 'op-a-2'],
  })
  useToastStore.setState({ toasts: [] })
})

afterAll(() => { vi.unstubAllGlobals() })

describe('clearAccountData', () => {
  it('empties every per-account store', () => {
    clearAccountData()

    expect(useFarmStore.getState()).toMatchObject({
      farms: [], activeFarmId: null, activeFarm: null, favoriteFarmId: null,
    })
    expect(useFieldStore.getState().fields).toEqual([])
    expect(useLivestockStore.getState().units).toEqual([])
    expect(useCropStore.getState()).toMatchObject({ crops: [], customCrops: [] })
    expect(useRecipeStore.getState().byFarm).toEqual({})
    expect(useHarvestHighlightStore.getState()).toMatchObject({ highlight: null, toggles: null })
    expect(useUnsavedWorkStore.getState().count).toBe(0)
    expect(useSettingsStore.getState().seenNotificationIds).toEqual([])
  })

  it('leaves nothing of the account in localStorage', () => {
    // What A left on disk, as the persisted stores wrote it.
    expect(persisted('mi-finca-livestock').units).toEqual([HERD])
    expect(persisted('mi-finca-crops').customCrops).toHaveLength(1)
    expect(persisted('mi-finca-settings').seenNotificationIds).toEqual(['op-a-1', 'op-a-2'])

    clearAccountData()

    expect(stored.has('mi-finca-livestock')).toBe(false)
    expect(stored.has('mi-finca-crops')).toBe(false)
    expect(persisted('mi-finca-settings').seenNotificationIds).toEqual([])
    expect([...stored.values()].join('\n')).not.toMatch(/-a\b|de A\b/)
  })

  it('moves the recipe revision forward, so caches keyed on it rebuild', () => {
    const before = useRecipeStore.getState().revision

    clearAccountData()

    expect(useRecipeStore.getState().revision).toBeGreaterThan(before)
  })

  it('leaves the device preferences alone', () => {
    useToastStore.getState().push('Ahora eres parte de "Finca Nueva"')

    clearAccountData()

    expect(useSettingsStore.getState().notificationPrefs).toEqual(PREFS)
    expect(persisted('mi-finca-settings').notificationPrefs).toEqual(PREFS)
    for (const [key, value] of Object.entries(DEVICE_KEYS)) {
      expect(stored.get(key)).toBe(value)
    }
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('leaves the stores usable for the next account', () => {
    clearAccountData()

    useLivestockStore.getState().setUnits([{ ...HERD, id: 'herd-b' }])
    useSettingsStore.getState().markNotificationsSeen(['op-b-1'])

    expect(persisted('mi-finca-livestock').units).toEqual([{ ...HERD, id: 'herd-b' }])
    expect(persisted('mi-finca-settings').seenNotificationIds).toEqual(['op-b-1'])
  })
})

describe('wipeAccount', () => {
  it('wipes the stores and what React Query fetched for the account', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['farms'], [FARM])
    queryClient.setQueryData(['fields', FARM.id], [FIELD])
    queryClient.setQueryData(['operations', 'ledger', FARM.id], [])

    wipeAccount(queryClient)

    expect(useFarmStore.getState().farms).toEqual([])
    expect(useFieldStore.getState().fields).toEqual([])
    expect(queryClient.getQueryCache().getAll()).toEqual([])
  })

  it('keeps the queries that belong to no account', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['farms'], [FARM])
    // The public signup config and the session probe.
    queryClient.setQueryData(['auth', 'config'], { signupMode: 'invite' })
    queryClient.setQueryData(['auth', 'refresh'], false)

    wipeAccount(queryClient)

    expect(queryClient.getQueryData(['farms'])).toBeUndefined()
    expect(queryClient.getQueryData(['auth', 'config'])).toEqual({ signupMode: 'invite' })
    expect(queryClient.getQueryData(['auth', 'refresh'])).toBe(false)
  })
})
