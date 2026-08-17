import { defineStore } from 'pinia'
import type { DatabaseEngine, ORMTarget } from '#shared/types/schema'
import { loadUiState, saveUiState } from '~/utils/persistence'
import { useWorkspaceStore } from './workspace'

/** The three canvas levels from refactor-plan.md. */
export type ViewLevel = 'databases' | 'schemas' | 'tables'

/** Which list the left sidebar's icon rail is showing. */
export type RailTab = 'databases' | 'schemas' | 'tables' | 'enums'

interface PersistedUiState {
  activeDbId: string | null
  activeSchemaId: string | null
  viewLevel: ViewLevel
  railTab: RailTab
  leftOpen: boolean
  rightOpen: boolean
  codeTarget: ORMTarget
  showRelations: boolean
  showEnums: boolean
  showTypes: boolean
  editable: boolean
}

const DEFAULTS: PersistedUiState = {
  activeDbId: null,
  activeSchemaId: null,
  viewLevel: 'tables',
  railTab: 'databases',
  leftOpen: true,
  rightOpen: true,
  codeTarget: 'prisma',
  // The four toggles behind the canvas gear popover.
  showRelations: true,
  showEnums: true,
  showTypes: true,
  editable: true
}

/**
 * Panel geometry from DB Canvas Designer.dc.html. Widths are owned by
 * UDashboardGroup, which persists them itself — the store only tracks
 * open/collapsed so the navbar buttons can drive it.
 */
export const LEFT_WIDTH = { min: 200, max: 500, default: 280 } as const
export const RIGHT_WIDTH = { min: 320, max: 800, default: 440 } as const
export const RAIL_WIDTH = 56
export const NAVBAR_HEIGHT = 52

export const useUiStore = defineStore('ui', () => {
  const state = reactive<PersistedUiState>({ ...DEFAULTS })
  const hydrated = ref(false)

  const workspaceStore = useWorkspaceStore()

  // ---------------------------------------------------------------- getters

  /** Falls back to the first database so the canvas is never pointed at nothing. */
  const activeDbId = computed<string | null>(() => {
    if (state.activeDbId && workspaceStore.database(state.activeDbId)) return state.activeDbId
    return workspaceStore.databases[0]?.id ?? null
  })

  const activeDatabase = computed(() =>
    activeDbId.value ? workspaceStore.database(activeDbId.value) : undefined
  )

  const activeSchemaId = computed<string | null>(() => {
    if (!state.activeSchemaId) return null
    const schema = workspaceStore.schema(state.activeSchemaId)
    if (!schema || schema.dbId !== activeDbId.value) return null
    return state.activeSchemaId
  })

  const activeSchema = computed(() =>
    activeSchemaId.value ? workspaceStore.schema(activeSchemaId.value) : undefined
  )

  const engine = computed<DatabaseEngine>(() => activeDatabase.value?.engine ?? 'postgresql')

  /** Drives the breadcrumb under the view switch. */
  const breadcrumb = computed(() => {
    const crumbs: { label: string, level: ViewLevel, schemaId?: string }[] = [
      { label: 'Databases', level: 'databases' }
    ]
    if (state.viewLevel === 'databases') return crumbs

    if (activeDatabase.value) {
      crumbs.push({ label: activeDatabase.value.name, level: 'schemas' })
    }
    if (state.viewLevel === 'tables' && activeSchema.value) {
      crumbs.push({ label: activeSchema.value.name, level: 'tables', schemaId: activeSchema.value.id })
    }
    return crumbs
  })

  // ---------------------------------------------------------------- actions

  function selectDatabase(id: string): void {
    state.activeDbId = id
    state.activeSchemaId = null
  }

  function selectSchema(id: string): void {
    const schema = workspaceStore.schema(id)
    if (!schema) return
    state.activeDbId = schema.dbId
    state.activeSchemaId = id
  }

  function setViewLevel(level: ViewLevel): void {
    state.viewLevel = level
  }

  /** Double-clicking a block drills one level in. */
  function drillInto(level: ViewLevel, id?: string): void {
    if (level === 'schemas' && id) selectDatabase(id)
    if (level === 'tables' && id) selectSchema(id)
    state.viewLevel = level
  }

  function setRailTab(tab: RailTab): void {
    state.railTab = tab
  }

  function toggleLeft(): void {
    state.leftOpen = !state.leftOpen
  }

  function toggleRight(): void {
    state.rightOpen = !state.rightOpen
  }

  function setCodeTarget(target: ORMTarget): void {
    state.codeTarget = target
  }

  function setEngine(next: DatabaseEngine): void {
    if (activeDbId.value) workspaceStore.updateDatabase(activeDbId.value, { engine: next })
  }

  function toggleDisplay(key: 'showRelations' | 'showEnums' | 'showTypes' | 'editable'): void {
    state[key] = !state[key]
  }

  // ------------------------------------------------------------ persistence

  function hydrate(): void {
    if (hydrated.value) return
    const saved = loadUiState<PersistedUiState>()
    if (saved) {
      for (const key of Object.keys(DEFAULTS) as (keyof PersistedUiState)[]) {
        const value = saved[key]
        if (value !== undefined && typeof value === typeof DEFAULTS[key]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (state as any)[key] = value
        }
      }
    }
    hydrated.value = true

    watch(
      () => ({ ...state }),
      snapshot => saveUiState(snapshot),
      { deep: true }
    )
  }

  return {
    state,
    hydrated,

    activeDbId,
    activeDatabase,
    activeSchemaId,
    activeSchema,
    engine,
    breadcrumb,

    selectDatabase,
    selectSchema,
    setViewLevel,
    drillInto,
    setRailTab,
    toggleLeft,
    toggleRight,
    setCodeTarget,
    setEngine,
    toggleDisplay,

    hydrate
  }
})
