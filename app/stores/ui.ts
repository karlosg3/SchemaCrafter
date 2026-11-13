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

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function oneOf<T extends string>(allowed: readonly T[]) {
  return (v: unknown): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v)
}

export const useUiStore = defineStore('ui', () => {
  const state = reactive<PersistedUiState>({ ...DEFAULTS })
  const hydrated = ref(false)
  /** Runtime-only flag reflecting unapplied edits in the RightSidebar code editor. */
  const hasUnappliedCode = ref(false)

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

  /**
   * Falls back to the database's first schema for the same reason activeDbId
   * falls back to the first database: the tables level has to point at
   * something, and a null here would render an empty canvas with a breadcrumb
   * that disagrees with it.
   */
  const activeSchemaId = computed<string | null>(() => {
    const schema = state.activeSchemaId ? workspaceStore.schema(state.activeSchemaId) : undefined
    if (schema && schema.dbId === activeDbId.value) return schema.id
    return activeDbId.value ? workspaceStore.schemasOfDatabase(activeDbId.value)[0]?.id ?? null : null
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

  function setHasUnappliedCode(dirty: boolean): void {
    hasUnappliedCode.value = dirty
  }

  // ------------------------------------------------------------ persistence

  /**
   * Per-key validation rather than `typeof saved === typeof default`. That
   * shortcut silently dropped every restored value for `activeDbId` and
   * `activeSchemaId`: their defaults are null, whose typeof is "object", so a
   * saved id string never matched and the canvas reopened on the wrong schema.
   */
  const VALIDATORS: { [K in keyof PersistedUiState]: (v: unknown) => v is PersistedUiState[K] } = {
    activeDbId: isNullableString,
    activeSchemaId: isNullableString,
    viewLevel: oneOf<ViewLevel>(['databases', 'schemas', 'tables']),
    railTab: oneOf<RailTab>(['databases', 'schemas', 'tables', 'enums']),
    leftOpen: isBoolean,
    rightOpen: isBoolean,
    codeTarget: oneOf<ORMTarget>(['sql', 'prisma', 'drizzle', 'typeorm', 'mikroorm']),
    showRelations: isBoolean,
    showEnums: isBoolean,
    showTypes: isBoolean,
    editable: isBoolean
  }

  function hydrate(): void {
    if (hydrated.value) return
    const saved = loadUiState<PersistedUiState>()
    if (saved) {
      for (const key of Object.keys(VALIDATORS) as (keyof PersistedUiState)[]) {
        const value = saved[key]
        if (VALIDATORS[key](value)) {
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
    hasUnappliedCode,

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
    setHasUnappliedCode,

    hydrate
  }
})
