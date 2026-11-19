import type {
  EndpointEntity,
  Gradient,
  HttpMethod,
  ModuleEntity,
  TableEntity,
  Workspace,
  XY
} from '../types/workspace'
import { slugify } from './ids'

export interface PathSegmentToken {
  text: string
  isParam: boolean
}

export interface CrudEndpointPreset {
  method: HttpMethod
  path: string
  description: string
  selectedByDefault: boolean
}

export interface InferredParentFk {
  columnName: string
  targetTableId: string
  targetTableName: string
  targetColumnId: string
  targetColumnName: string
}

export interface InferredTableProposal {
  tableName: string
  parentFk: InferredParentFk | null
}

export interface ModuleNodeData {
  moduleId: string
  name: string
  basePath: string
  description?: string
  gradient: Gradient
  endpoints: {
    id: string
    method: HttpMethod
    path: string
    description: string
    tableCount: number
  }[]
  tableCount: number
  editable: boolean
}

export interface EntityRefNodeData {
  tableId: string
  name: string
  schemaId: string
  schemaName: string
  gradient: Gradient
  columns: {
    id: string
    name: string
    type: string
    isPrimaryKey: boolean
    isForeignKey: boolean
  }[]
  totalColumnCount: number
  linkedModuleCount: number
  endpointCount: number
  editable: boolean
}

export type ModulesGraphNode
  = | { id: string, type: 'module', position: XY, data: ModuleNodeData }
    | { id: string, type: 'entityRef', position: XY, data: EntityRefNodeData }

export interface ModulesGraphEdge {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  data: {
    moduleId: string
    tableId: string
    endpointCount: number
    label: string
  }
}

export interface ModulesGraph {
  nodes: ModulesGraphNode[]
  edges: ModulesGraphEdge[]
}

export const MODULE_SOURCE_HANDLE = 'module-source'
export const ENTITY_TARGET_HANDLE = 'entity-target'

const GRID_STEP = 16
const MODULE_NODE_WIDTH = 310
const MODULE_ORIGIN_X = 80
const ENTITY_ORIGIN_X = 560
const ORIGIN_Y = 80
const ROW_GAP = 48

function snap(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP
}

function snapCeil(value: number): number {
  return Math.ceil(value / GRID_STEP) * GRID_STEP
}

/**
 * Normalizes an endpoint route path: guarantees leading `/`, collapses repeated
 * slashes, and trims trailing slashes except for root `/`.
 */
export function normalizeEndpointPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '/'
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const collapsed = withSlash.replace(/\/{2,}/g, '/')
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed
}

/** Normalizes a module base prefix (`""` or `"/prefix"`). */
export function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '/') return ''
  return normalizeEndpointPath(trimmed)
}

/**
 * Joins a module basePath with an endpoint path without duplicating the prefix
 * when the endpoint path already starts with it.
 */
export function resolveFullEndpointPath(basePath: string, endpointPath: string): string {
  const base = normalizeBasePath(basePath)
  const ep = normalizeEndpointPath(endpointPath)
  if (!base) return ep
  if (ep === base || ep.startsWith(`${base}/`)) return ep
  if (ep === '/') return base
  return normalizeEndpointPath(`${base}${ep}`)
}

/** Splits a route path into visual segments so `:id` / `{id}` params can be highlighted. */
export function splitPathSegments(path: string): PathSegmentToken[] {
  const normalized = normalizeEndpointPath(path)
  if (normalized === '/') return [{ text: '/', isParam: false }]

  const parts = normalized.split('/').filter(Boolean)
  const tokens: PathSegmentToken[] = []
  for (const part of parts) {
    tokens.push({ text: '/', isParam: false })
    const isParam = part.startsWith(':') || (part.startsWith('{') && part.endsWith('}'))
    tokens.push({ text: part, isParam })
  }
  return tokens
}

/** `user_profiles` -> `User Profiles` for default module naming. */
export function humanizeResourceName(tableName: string): string {
  const words = tableName
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'Module'
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

/** `user_profiles` -> `/user-profiles` for default REST route slug. */
export function tableToRouteSlug(tableName: string): string {
  const slug = slugify(tableName).replace(/_/g, '-')
  return `/${slug}`
}

/** Naive singular helper for clean descriptions and FK column names (`users` -> `user`). */
export function singularizeWord(word: string): string {
  const lower = word.toLowerCase()
  if (lower.endsWith('ies') && lower.length > 3) return `${lower.slice(0, -3)}y`
  if (/(?:ches|shes|xes|zes|ses)$/.test(lower) && lower.length > 4) return lower.slice(0, -2)
  if (lower.endsWith('s') && !lower.endsWith('ss') && !lower.endsWith('us') && lower.length > 2) {
    return lower.slice(0, -1)
  }
  return lower
}

/** Builds a standard REST CRUD preset list for a table. */
export function buildCrudEndpointPresets(tableName: string, basePath?: string): CrudEndpointPreset[] {
  const root = normalizeBasePath(basePath ?? '') || tableToRouteSlug(tableName)
  const resourceLabel = tableName.replace(/[_-]+/g, ' ').trim() || 'items'
  const singular = singularizeWord(resourceLabel.split(/\s+/).pop() || resourceLabel)

  return [
    {
      method: 'GET',
      path: root,
      description: `List ${resourceLabel}`,
      selectedByDefault: true
    },
    {
      method: 'GET',
      path: `${root}/:id`,
      description: `Get a single ${singular} by ID`,
      selectedByDefault: true
    },
    {
      method: 'POST',
      path: root,
      description: `Create a new ${singular}`,
      selectedByDefault: true
    },
    {
      method: 'PATCH',
      path: `${root}/:id`,
      description: `Update an existing ${singular}`,
      selectedByDefault: true
    },
    {
      method: 'PUT',
      path: `${root}/:id`,
      description: `Replace an existing ${singular}`,
      selectedByDefault: false
    },
    {
      method: 'DELETE',
      path: `${root}/:id`,
      description: `Delete a ${singular} by ID`,
      selectedByDefault: true
    }
  ]
}

const IGNORED_PATH_SEGMENTS = new Set(['api', 'rest', 'v1', 'v2', 'v3', 'v4', 'public', 'internal'])

function isParamSegment(segment: string): boolean {
  return segment.startsWith(':') || (segment.startsWith('{') && segment.endsWith('}'))
}

function normalizeResourceSegment(segment: string): string {
  const camelSplit = segment.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  return slugify(camelSplit)
}

/**
 * Infers a suggested snake_case table name (and optional parent FK for nested routes
 * like `/users/:id/sessions`) from an HTTP endpoint path.
 */
export function inferTableFromEndpointPath(
  path: string,
  existingTables: ReadonlyArray<{
    id: string
    name: string
    columns: ReadonlyArray<{ id: string, name: string, isPrimaryKey: boolean }>
  }> = []
): InferredTableProposal {
  const parts = normalizeEndpointPath(path)
    .split('/')
    .filter(Boolean)
    .filter(seg => !isParamSegment(seg))
    .map(normalizeResourceSegment)
    .filter(seg => seg.length > 0 && !IGNORED_PATH_SEGMENTS.has(seg))

  const tableName = parts.length > 0 ? parts[parts.length - 1]! : 'resources'

  let parentFk: InferredParentFk | null = null
  if (parts.length >= 2) {
    const parentSeg = parts[parts.length - 2]!
    const parentSingular = singularizeWord(parentSeg)
    const matchedParent = existingTables.find((t) => {
      const normalized = slugify(t.name)
      return normalized === parentSeg || singularizeWord(normalized) === parentSingular
    })

    if (matchedParent) {
      const pkCol = matchedParent.columns.find(c => c.isPrimaryKey) ?? matchedParent.columns[0]
      if (pkCol) {
        parentFk = {
          columnName: `${singularizeWord(slugify(matchedParent.name))}_id`,
          targetTableId: matchedParent.id,
          targetTableName: matchedParent.name,
          targetColumnId: pkCol.id,
          targetColumnName: pkCol.name
        }
      }
    }
  }

  return { tableName, parentFk }
}

function estimateModuleHeight(endpointCount: number): number {
  const visibleRows = Math.min(endpointCount, 6)
  const overflowRow = endpointCount > 6 ? 26 : 0
  return 44 + 30 + visibleRows * 28 + overflowRow + 36
}

function estimateEntityRefHeight(columnCount: number): number {
  const visibleCols = Math.min(columnCount, 5)
  const overflowRow = columnCount > 5 ? 24 : 0
  return 42 + visibleCols * 24 + overflowRow + 12
}

/**
 * Computes clean non-overlapping left-to-right positions for modules and linked entity
 * reference cards in the Modules canvas view, ordering entities by module barycenter.
 */
export function computeModulesLayout(
  modules: readonly ModuleEntity[],
  tables: readonly TableEntity[]
): { modulePositions: Record<string, XY>, entityPositions: Record<string, XY> } {
  const modulePositions: Record<string, XY> = {}
  const entityPositions: Record<string, XY> = {}

  let modY = ORIGIN_Y
  const modCenterY = new Map<string, number>()

  for (const mod of modules) {
    const h = mod.size?.height ?? estimateModuleHeight(mod.endpointIds.length)
    modulePositions[mod.id] = { x: MODULE_ORIGIN_X, y: snap(modY) }
    modCenterY.set(mod.id, modY + h / 2)
    modY = snapCeil(modY + h + ROW_GAP)
  }

  const linkedByTable = new Map<string, number[]>()
  for (const mod of modules) {
    const cy = modCenterY.get(mod.id) ?? ORIGIN_Y
    for (const tableId of mod.tableIds) {
      const list = linkedByTable.get(tableId)
      if (list) list.push(cy)
      else linkedByTable.set(tableId, [cy])
    }
  }

  const orderedTables = [...tables].sort((a, b) => {
    const la = linkedByTable.get(a.id)
    const lb = linkedByTable.get(b.id)
    const aLinked = !!la && la.length > 0
    const bLinked = !!lb && lb.length > 0
    if (aLinked !== bLinked) return aLinked ? -1 : 1
    if (aLinked && bLinked) {
      const avgA = la!.reduce((s, v) => s + v, 0) / la!.length
      const avgB = lb!.reduce((s, v) => s + v, 0) / lb!.length
      if (Math.abs(avgA - avgB) > 1) return avgA - avgB
    }
    return a.name.localeCompare(b.name)
  })

  let prevBottom = -Infinity
  for (const table of orderedTables) {
    const h = estimateEntityRefHeight(table.columns.length)
    const ys = linkedByTable.get(table.id)
    const idealTop = ys && ys.length > 0
      ? ys.reduce((s, v) => s + v, 0) / ys.length - h / 2
      : (prevBottom === -Infinity ? ORIGIN_Y : prevBottom + ROW_GAP)
    const minAllowed = prevBottom === -Infinity ? ORIGIN_Y : snapCeil(prevBottom + ROW_GAP)
    const finalY = Math.max(snap(idealTop), minAllowed)
    entityPositions[table.id] = { x: ENTITY_ORIGIN_X, y: finalY }
    prevBottom = finalY + h
  }

  return { modulePositions, entityPositions }
}

/**
 * Pure Vue Flow descriptor builder for the Modules <-> Entities interactive canvas.
 */
export function buildModulesGraph(
  ws: Workspace,
  dbId: string,
  options: { showUnlinkedTables: boolean, editable: boolean }
): ModulesGraph {
  const db = ws.databases.find(d => d.id === dbId)
  if (!db) return { nodes: [], edges: [] }

  const modules = (db.moduleIds ?? [])
    .map(id => ws.modules?.[id])
    .filter((m): m is ModuleEntity => !!m)

  const allTables: TableEntity[] = []
  const schemaNameById = new Map<string, string>()
  for (const schemaId of db.schemaIds) {
    const schema = ws.schemas[schemaId]
    if (!schema) continue
    schemaNameById.set(schema.id, schema.name)
    for (const tableId of schema.tableIds) {
      const table = ws.tables[tableId]
      if (table) allTables.push(table)
    }
  }

  const linkedModuleCount = new Map<string, number>()
  const endpointCountByTable = new Map<string, number>()
  const pairEndpointCounts = new Map<string, number>()

  for (const mod of modules) {
    for (const tableId of mod.tableIds) {
      linkedModuleCount.set(tableId, (linkedModuleCount.get(tableId) ?? 0) + 1)
    }
    for (const epId of mod.endpointIds) {
      const ep = ws.endpoints?.[epId]
      if (!ep) continue
      for (const tableId of ep.tableIds) {
        endpointCountByTable.set(tableId, (endpointCountByTable.get(tableId) ?? 0) + 1)
        const pairKey = `${mod.id}|${tableId}`
        pairEndpointCounts.set(pairKey, (pairEndpointCounts.get(pairKey) ?? 0) + 1)
      }
    }
  }

  const visibleTables = options.showUnlinkedTables
    ? allTables
    : allTables.filter(t => (linkedModuleCount.get(t.id) ?? 0) > 0)

  const visibleTableSet = new Set(visibleTables.map(t => t.id))
  const computed = computeModulesLayout(modules, visibleTables)

  const moduleNodes: ModulesGraphNode[] = modules.map((mod) => {
    const endpoints: EndpointEntity[] = mod.endpointIds
      .map(id => ws.endpoints?.[id])
      .filter((e): e is EndpointEntity => !!e)

    return {
      id: mod.id,
      type: 'module',
      position: mod.position ?? computed.modulePositions[mod.id] ?? { x: MODULE_ORIGIN_X, y: ORIGIN_Y },
      data: {
        moduleId: mod.id,
        name: mod.name,
        basePath: mod.basePath,
        ...(mod.description ? { description: mod.description } : {}),
        gradient: mod.gradient,
        endpoints: endpoints.map(ep => ({
          id: ep.id,
          method: ep.method,
          path: ep.path,
          description: ep.description,
          tableCount: ep.tableIds.length
        })),
        tableCount: mod.tableIds.length,
        editable: options.editable
      }
    }
  })

  const entityNodes: ModulesGraphNode[] = visibleTables.map(t => ({
    id: `entity:${t.id}`,
    type: 'entityRef',
    position: computed.entityPositions[t.id] ?? { x: ENTITY_ORIGIN_X, y: ORIGIN_Y },
    data: {
      tableId: t.id,
      name: t.name,
      schemaId: t.schemaId,
      schemaName: schemaNameById.get(t.schemaId) ?? 'public',
      gradient: t.gradient,
      columns: t.columns.slice(0, 5).map(col => ({
        id: col.id,
        name: col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        isForeignKey: !!col.foreignKey
      })),
      totalColumnCount: t.columns.length,
      linkedModuleCount: linkedModuleCount.get(t.id) ?? 0,
      endpointCount: endpointCountByTable.get(t.id) ?? 0,
      editable: options.editable
    }
  }))

  const edges: ModulesGraphEdge[] = []
  for (const mod of modules) {
    for (const tableId of mod.tableIds) {
      if (!visibleTableSet.has(tableId)) continue
      const epCount = pairEndpointCounts.get(`${mod.id}|${tableId}`) ?? 0
      edges.push({
        id: `mod-rel:${mod.id}->${tableId}`,
        source: mod.id,
        target: `entity:${tableId}`,
        sourceHandle: MODULE_SOURCE_HANDLE,
        targetHandle: ENTITY_TARGET_HANDLE,
        data: {
          moduleId: mod.id,
          tableId,
          endpointCount: epCount,
          label: epCount > 0 ? `${epCount} ${epCount === 1 ? 'endpoint' : 'endpoints'}` : 'linked'
        }
      })
    }
  }

  return {
    nodes: [...moduleNodes, ...entityNodes],
    edges
  }
}

export { MODULE_NODE_WIDTH }
