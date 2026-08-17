import type { Gradient, WH, Workspace, XY } from '../types/workspace'
import { ENUM_GRADIENT } from '../types/workspace'

/**
 * Canvas graph construction.
 *
 * Pure on purpose: it takes a Workspace plus the current view and returns plain
 * node/edge descriptors, with no Vue Flow types anywhere in the signature. That
 * keeps the three-level canvas from .claude/docs/refactor-plan.md testable in
 * plain node, and keeps the store free of presentation concerns.
 */

export type ViewLevel = 'databases' | 'schemas' | 'tables'
export type BlockKind = 'database' | 'schema' | 'table' | 'enum'

/** Block geometry from DB Canvas Designer.dc.html. Mirrored in main.css. */
export const BLOCK = {
  width: 260,
  widthEnum: 220,
  headerHeight: 40,
  rowHeight: 32,
  rowHeightEnum: 28,
  footerHeight: 34,
  borderWidth: 2
} as const

/** Grid fallback for entities that have never been dragged. Matches autoLayout. */
const LAYOUT = { originX: 80, originY: 80, stepX: 380, stepY: 340, wrapAfterX: 1100 } as const

export interface BlockRow {
  id: string
  label: string
  /** Muted right-aligned text, e.g. "5 tables". */
  sub?: string
  /** Pill, e.g. a column's data type. */
  badge?: string
  isPrimaryKey?: boolean
  /** Tables level only: the row exposes a pair of connection handles. */
  connectable?: boolean
  /** What clicking the row does. */
  action?: { kind: 'drill', level: ViewLevel, id: string } | { kind: 'edit', target: BlockKind, id: string }
  deletable?: boolean
  /** Why deletion is unavailable, surfaced as a tooltip. */
  deleteHint?: string
}

export interface BlockNodeData {
  kind: BlockKind
  name: string
  gradient: Gradient
  rows: BlockRow[]
  rowHeight: number
  width: number
  /** Persisted resize override, when the user has dragged the handles. */
  size?: WH
  /** Label for the dashed footer button; absent means no footer. */
  addLabel?: string
  /** Double-clicking drills one level in. */
  drillTo?: { level: ViewLevel, id: string }
  deletable?: boolean
  deleteHint?: string
}

/** A cross-schema foreign key's 64px stub, standing in for the unseen table. */
export interface StubNodeData {
  label: string
  /** The schema the reference points into, so clicking can drill there. */
  schemaId?: string
}

export type GraphNode =
  | { id: string, type: 'block', position: XY, data: BlockNodeData }
  | { id: string, type: 'stub', position: XY, data: StubNodeData }

export type RelationKind = 'fk' | 'enum' | 'cross' | 'aggregate'

export interface GraphEdge {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  data: { kind: RelationKind, label: string, width: number }
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphOptions {
  level: ViewLevel
  dbId: string | null
  schemaId: string | null
  showRelations: boolean
  showEnums: boolean
  showTypes: boolean
  editable: boolean
}

/** Block-level handles. Rows carry their own at the tables level. */
export const BLOCK_SOURCE_HANDLE = 'block-source'
export const BLOCK_TARGET_HANDLE = 'block-target'

export function rowSourceHandle(columnId: string): string {
  return `${columnId}-source`
}

export function rowTargetHandle(columnId: string): string {
  return `${columnId}-target`
}

/** `col-1f2e-source` -> `col-1f2e`. Returns null for block-level handles. */
export function columnIdFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null
  const match = /^(.+)-(?:source|target)$/.exec(handle)
  if (!match || handle === BLOCK_SOURCE_HANDLE || handle === BLOCK_TARGET_HANDLE) return null
  return match[1]!
}

/** Total height of a block whose size has not been overridden. */
export function blockHeight(data: Pick<BlockNodeData, 'rows' | 'rowHeight' | 'addLabel'>): number {
  return BLOCK.headerHeight
    + data.rows.length * data.rowHeight
    + (data.addLabel ? BLOCK.footerHeight : 0)
    + BLOCK.borderWidth * 2
}

function fallbackPosition(index: number): XY {
  let x = LAYOUT.originX
  let y = LAYOUT.originY
  for (let i = 0; i < index; i++) {
    x += LAYOUT.stepX
    if (x > LAYOUT.wrapAfterX) {
      x = LAYOUT.originX
      y += LAYOUT.stepY
    }
  }
  return { x, y }
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

// ------------------------------------------------------------------- levels

function databasesGraph(ws: Workspace, options: GraphOptions): Graph {
  const nodes = ws.databases.map<GraphNode>((db, index) => {
    const rows = db.schemaIds
      .map(id => ws.schemas[id])
      .filter(s => !!s)
      .map<BlockRow>(s => ({
        id: s.id,
        label: s.name,
        sub: plural(s.tableIds.length, 'table'),
        action: { kind: 'drill', level: 'tables', id: s.id },
        // refactor-plan.md:46 — a schema is only deletable while it is empty.
        deletable: options.editable && s.tableIds.length === 0 && s.enumIds.length === 0,
        deleteHint: 'Schema is not empty'
      }))

    return {
      id: db.id,
      type: 'block',
      position: db.position ?? fallbackPosition(index),
      data: {
        kind: 'database',
        name: db.name,
        gradient: db.gradient,
        rows,
        rowHeight: BLOCK.rowHeight,
        width: BLOCK.width,
        size: db.size,
        addLabel: options.editable ? 'Add schema' : undefined,
        drillTo: { level: 'schemas', id: db.id },
        deletable: options.editable && ws.databases.length > 1,
        deleteHint: 'The last database cannot be deleted'
      }
    }
  })

  // Databases are independent by definition; the prototype draws no edges here.
  return { nodes, edges: [] }
}

function schemasGraph(ws: Workspace, options: GraphOptions): Graph {
  const db = ws.databases.find(d => d.id === options.dbId)
  if (!db) return { nodes: [], edges: [] }

  const schemas = db.schemaIds.map(id => ws.schemas[id]).filter(s => !!s)

  const nodes = schemas.map<GraphNode>((s, index) => {
    const rows = s.tableIds
      .map(id => ws.tables[id])
      .filter(t => !!t)
      .map<BlockRow>(t => ({
        id: t.id,
        label: t.name,
        sub: plural(t.columns.length, 'field'),
        action: { kind: 'edit', target: 'table', id: t.id },
        deletable: options.editable
      }))

    return {
      id: s.id,
      type: 'block',
      position: s.position ?? fallbackPosition(index),
      data: {
        kind: 'schema',
        name: s.name,
        gradient: s.gradient,
        rows,
        rowHeight: BLOCK.rowHeight,
        width: BLOCK.width,
        size: s.size,
        addLabel: options.editable ? 'Add table' : undefined,
        drillTo: { level: 'tables', id: s.id },
        deletable: options.editable && s.tableIds.length === 0 && s.enumIds.length === 0,
        deleteHint: 'Schema is not empty'
      }
    }
  })

  const edges = options.showRelations ? aggregateEdges(ws, schemas.map(s => s.id)) : []
  return { nodes, edges }
}

/**
 * One edge per schema pair, weighted by how many cross-schema foreign keys run
 * between them. Same-schema keys are the tables level's business, not this one.
 */
function aggregateEdges(ws: Workspace, schemaIds: string[]): GraphEdge[] {
  const present = new Set(schemaIds)
  const counts = new Map<string, number>()

  for (const schemaId of schemaIds) {
    const s = ws.schemas[schemaId]
    if (!s) continue
    for (const tableId of s.tableIds) {
      for (const col of ws.tables[tableId]?.columns ?? []) {
        const targetSchemaId = col.foreignKey && ws.tables[col.foreignKey.targetTableId]?.schemaId
        if (!targetSchemaId || targetSchemaId === schemaId || !present.has(targetSchemaId)) continue
        const key = [schemaId, targetSchemaId].sort().join('|')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }

  return [...counts].map(([key, count]) => {
    const [a, b] = key.split('|') as [string, string]
    return {
      id: `agg-${key}`,
      source: a,
      target: b,
      sourceHandle: BLOCK_SOURCE_HANDLE,
      targetHandle: BLOCK_TARGET_HANDLE,
      data: {
        kind: 'aggregate' as const,
        label: `${count} fk`,
        // Prototype thresholds: 2 / 4 / 8 for <=5, 6-10 and >10.
        width: count > 10 ? 8 : count > 5 ? 4 : 2
      }
    }
  })
}

function tablesGraph(ws: Workspace, options: GraphOptions): Graph {
  const schemaId = options.schemaId
  const s = schemaId ? ws.schemas[schemaId] : undefined
  if (!s || !schemaId) return { nodes: [], edges: [] }

  const tables = s.tableIds.map(id => ws.tables[id]).filter(t => !!t)
  const enums = options.showEnums ? s.enumIds.map(id => ws.enums[id]).filter(e => !!e) : []

  const tableNodes = tables.map<GraphNode>((t, index) => ({
    id: t.id,
    type: 'block',
    position: t.position ?? fallbackPosition(index),
    data: {
      kind: 'table',
      name: t.name,
      gradient: t.gradient,
      rows: t.columns.map<BlockRow>(col => ({
        id: col.id,
        label: col.name,
        badge: options.showTypes
          ? (col.type === 'ENUM' && col.enumName ? col.enumName : col.type)
          : undefined,
        isPrimaryKey: col.isPrimaryKey,
        connectable: true,
        action: { kind: 'edit', target: 'table', id: t.id },
        deletable: options.editable
      })),
      rowHeight: BLOCK.rowHeight,
      width: BLOCK.width,
      size: t.size,
      addLabel: options.editable ? 'Add field' : undefined,
      deletable: options.editable
    }
  }))

  const enumNodes = enums.map<GraphNode>((e, index) => ({
    id: e.id,
    type: 'block',
    position: e.position ?? { x: 1220, y: LAYOUT.originY + index * LAYOUT.stepY },
    data: {
      kind: 'enum',
      name: e.name,
      // refactor-plan.md:80 — enums are locked to red, not user-recolourable.
      gradient: ENUM_GRADIENT,
      rows: e.values.map<BlockRow>(v => ({ id: `${e.id}:${v}`, label: v })),
      rowHeight: BLOCK.rowHeightEnum,
      width: BLOCK.widthEnum,
      size: e.size,
      addLabel: options.editable ? 'Add value' : undefined,
      deletable: options.editable
    }
  }))

  const nodes = [...tableNodes, ...enumNodes]
  if (!options.showRelations) return { nodes, edges: [] }

  const { edges, stubs } = relationEdges(ws, tables, schemaId, options.showEnums)
  return { nodes: [...nodes, ...stubs], edges }
}

/**
 * Foreign-key and enum edges for one schema.
 *
 * A key pointing outside the schema has no node to land on, so it gets a stub
 * node 64px to the right of its row — the prototype's dangling labelled line,
 * made drillable.
 */
function relationEdges(
  ws: Workspace,
  tables: NonNullable<Workspace['tables'][string]>[],
  schemaId: string,
  showEnums: boolean
): { edges: GraphEdge[], stubs: GraphNode[] } {
  const edges: GraphEdge[] = []
  const stubs: GraphNode[] = []
  const enumsByName = new Map(
    Object.values(ws.enums).filter(e => e.schemaId === schemaId).map(e => [e.name, e])
  )

  for (const t of tables) {
    t.columns.forEach((col, rowIndex) => {
      if (col.foreignKey) {
        const target = ws.tables[col.foreignKey.targetTableId]
        if (target && target.schemaId === schemaId) {
          edges.push({
            id: `fk-${t.id}-${col.id}`,
            source: t.id,
            target: target.id,
            sourceHandle: rowSourceHandle(col.id),
            targetHandle: rowTargetHandle(col.foreignKey.targetColumnId),
            data: { kind: 'fk', label: 'N : 1', width: 2 }
          })
        } else if (target) {
          const targetSchema = ws.schemas[target.schemaId]
          const stubId = `stub-${t.id}-${col.id}`
          const width = t.size?.width ?? BLOCK.width
          const anchor = t.position ?? { x: 0, y: 0 }
          stubs.push({
            id: stubId,
            type: 'stub',
            position: {
              x: anchor.x + width + 64,
              y: anchor.y + BLOCK.headerHeight + rowIndex * BLOCK.rowHeight
            },
            data: {
              label: `${targetSchema?.name ?? '?'}.${target.name}`,
              schemaId: target.schemaId
            }
          })
          edges.push({
            id: `xs-${t.id}-${col.id}`,
            source: t.id,
            target: stubId,
            sourceHandle: rowSourceHandle(col.id),
            targetHandle: BLOCK_TARGET_HANDLE,
            data: { kind: 'cross', label: '', width: 2 }
          })
        }
      }

      if (showEnums && col.type === 'ENUM' && col.enumName) {
        const e = enumsByName.get(col.enumName)
        if (e) {
          edges.push({
            id: `enum-${t.id}-${col.id}`,
            source: t.id,
            target: e.id,
            sourceHandle: rowSourceHandle(col.id),
            targetHandle: BLOCK_TARGET_HANDLE,
            data: { kind: 'enum', label: 'ENUM', width: 2 }
          })
        }
      }
    })
  }

  return { edges, stubs }
}

export function buildGraph(ws: Workspace, options: GraphOptions): Graph {
  if (options.level === 'databases') return databasesGraph(ws, options)
  if (options.level === 'schemas') return schemasGraph(ws, options)
  return tablesGraph(ws, options)
}
