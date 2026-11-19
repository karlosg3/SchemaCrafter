import type { Column, DatabaseEngine, IndexDefinition } from './schema'

/**
 * The canonical, persisted model.
 *
 * The legacy `DatabaseProject` in ./schema.ts is a denormalized view of one
 * database: schemas, tables and enums as sibling arrays. It cannot express more
 * than one database, so the canvas has no Databases level to drill down from.
 *
 * This model normalizes those into id-keyed records with explicit membership,
 * which the three-level canvas in .claude/docs/refactor-plan.md needs. The
 * generators and parsers still speak `DatabaseProject`; shared/utils/projection.ts
 * converts between the two.
 */

export interface XY {
  x: number
  y: number
}

export interface WH {
  width: number
  height: number
}

/** `[from, to]` — the prototype paints block headers with a vertical gradient. */
export type Gradient = [from: string, to: string]

/** The 8 curated architectural drafting inks harmonizing with Blueprint Dark and Paper Light. */
export const GRADIENTS: Gradient[] = [
  ['#265385', '#193A62'], // Prussian Blue
  ['#EA6A38', '#C8431F'], // Vermilion Terracotta
  ['#2A7B5B', '#1C5941'], // Nordic Pine
  ['#D99426', '#B47415'], // Drafting Ochre
  ['#A63A50', '#7D273A'], // Deep Burgundy
  ['#257A8C', '#1A5A69'], // Steel Teal
  ['#5A6B7C', '#3F4E5E'], // Warm Slate
  ['#8C6244', '#694730'] // Umber Bronze
]

const LEGACY_GRADIENTS: Gradient[] = [
  ['#6366f1', '#8b5cf6'],
  ['#22c55e', '#16a34a'],
  ['#f59e0b', '#ea580c'],
  ['#0ea5e9', '#0284c7'],
  ['#ec4899', '#db2777'],
  ['#64748b', '#475569']
]

/** New entities default to Warm Slate drafting ink. */
export const DEFAULT_GRADIENT: Gradient = ['#5A6B7C', '#3F4E5E']

/** Enums use Deep Burgundy so they stand apart from user-coloured tables. */
export const ENUM_GRADIENT: Gradient = ['#B93F4E', '#8F2937']

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface DatabaseEntity {
  id: string
  name: string
  engine: DatabaseEngine
  gradient: Gradient
  /** Ordered — drives both the sidebar list and the block's row order. */
  schemaIds: string[]
  /** Ordered API modules belonging to this database. */
  moduleIds?: string[]
  position?: XY
  size?: WH
  comment?: string
}

export interface SchemaEntity {
  id: string
  dbId: string
  name: string
  gradient: Gradient
  tableIds: string[]
  enumIds: string[]
  position?: XY
  size?: WH
  comment?: string
}

export interface TableEntity {
  id: string
  /**
   * Required, unlike the legacy `Table.schemaId`. Deleting a schema used to
   * orphan its tables by setting this to undefined; they now move to the
   * database's `public` schema instead.
   */
  schemaId: string
  name: string
  gradient: Gradient
  columns: Column[]
  indexes?: IndexDefinition[]
  position: XY
  /** Persisted node size — the old model dropped resizer dimensions (APP-3). */
  size?: WH
  comment?: string
}

export interface EnumEntity {
  id: string
  schemaId: string
  name: string
  values: string[]
  position?: XY
  size?: WH
  comment?: string
}

export interface ModuleEntity {
  id: string
  dbId: string
  name: string
  /** Optional base URL prefix for the module, e.g. `/users` or `/api/orders`. */
  basePath: string
  description?: string
  gradient: Gradient
  /** Ordered linked table ids across any schema in the same database. */
  tableIds: string[]
  /** Ordered endpoint ids belonging to this module. */
  endpointIds: string[]
  position?: XY
  size?: WH
}

export interface EndpointEntity {
  id: string
  moduleId: string
  method: HttpMethod
  path: string
  description: string
  /** Concrete tables touched by this endpoint (subset kept synced with parent module.tableIds). */
  tableIds: string[]
}

export const WORKSPACE_FORMAT_VERSION = 2 as const

export interface Workspace {
  formatVersion: typeof WORKSPACE_FORMAT_VERSION
  /** Ordered. */
  databases: DatabaseEntity[]
  schemas: Record<string, SchemaEntity>
  tables: Record<string, TableEntity>
  enums: Record<string, EnumEntity>
  modules?: Record<string, ModuleEntity>
  endpoints?: Record<string, EndpointEntity>
}

export function emptyWorkspace(): Workspace {
  return {
    formatVersion: WORKSPACE_FORMAT_VERSION,
    databases: [],
    schemas: {},
    tables: {},
    enums: {},
    modules: {},
    endpoints: {}
  }
}

/**
 * Legacy `color` -> gradient. Uses the prototype gradient whose `from` matches,
 * otherwise pairs the colour with itself so no user-chosen colour is lost.
 */
export function gradientFromColor(color: string | undefined): Gradient {
  if (!color) return DEFAULT_GRADIENT
  const lower = color.toLowerCase()
  const known = GRADIENTS.find(g => g[0].toLowerCase() === lower)
    ?? LEGACY_GRADIENTS.find(g => g[0].toLowerCase() === lower)
  return known ? [...known] as Gradient : [color, color]
}
