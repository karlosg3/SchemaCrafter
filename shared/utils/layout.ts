import type { XY } from '../types/workspace'
import { BLOCK } from './graph'

export interface LayoutTableInput {
  id: string
  name: string
  columns: ReadonlyArray<{ foreignKey?: { targetTableId: string } }>
  width?: number
  height?: number
}

export interface LayoutEnumInput {
  id: string
  name: string
  valuesCount?: number
  width?: number
  height?: number
}

export interface DagLayoutResult {
  tablePositions: Record<string, XY>
  enumPositions: Record<string, XY>
}

export interface AlignableNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type AlignmentMode =
  | 'left'
  | 'centerX'
  | 'right'
  | 'top'
  | 'centerY'
  | 'bottom'
  | 'distributeH'
  | 'distributeV'

const GRID_STEP = 16
const ORIGIN_X = 80
const ORIGIN_Y = 80
const COLUMN_GAP = 144
const ROW_GAP = 48

function snap(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP
}

function estimateTableHeight(columnCount: number): number {
  const addBarHeight = 32
  return BLOCK.headerHeight + columnCount * BLOCK.rowHeight + addBarHeight + BLOCK.borderWidth * 2
}

function estimateEnumHeight(valuesCount = 3): number {
  const addBarHeight = 32
  return BLOCK.headerHeight + valuesCount * BLOCK.rowHeightEnum + addBarHeight + BLOCK.borderWidth * 2
}

/**
 * Computes a left-to-right layered DAG layout aligned to Vue Flow's right-source -> left-target
 * FK handle direction. Handles cycles safely by breaking back-edges via DFS state tracking.
 */
export function computeDagSchemaLayout(
  tables: readonly LayoutTableInput[],
  enums: readonly LayoutEnumInput[] = []
): DagLayoutResult {
  const tablePositions: Record<string, XY> = {}
  const enumPositions: Record<string, XY> = {}

  if (tables.length === 0 && enums.length === 0) {
    return { tablePositions, enumPositions }
  }

  const tableSet = new Set(tables.map(t => t.id))
  const byId = new Map(tables.map(t => [t.id, t]))

  // Adjacency: child table (has FK) -> parent table (referenced target)
  const outEdges = new Map<string, string[]>()
  for (const t of tables) {
    const targets = new Set<string>()
    for (const col of t.columns) {
      const targetId = col.foreignKey?.targetTableId
      if (targetId && targetId !== t.id && tableSet.has(targetId)) {
        targets.add(targetId)
      }
    }
    outEdges.set(t.id, [...targets])
  }

  // DFS post-order + cycle detection so every back-edge is ignored when computing longest-path ranks
  const state = new Map<string, 0 | 1 | 2>()
  const dagAdj = new Map<string, string[]>()
  for (const t of tables) dagAdj.set(t.id, [])

  function dfsBreakCycles(u: string): void {
    state.set(u, 1)
    for (const v of outEdges.get(u) ?? []) {
      const st = state.get(v) ?? 0
      if (st === 1) continue // cycle back-edge -> skip
      dagAdj.get(u)!.push(v)
      if (st === 0) dfsBreakCycles(v)
    }
    state.set(u, 2)
  }

  const orderedSeeds = [...tables].sort((a, b) => a.name.localeCompare(b.name))
  for (const t of orderedSeeds) {
    if ((state.get(t.id) ?? 0) === 0) dfsBreakCycles(t.id)
  }

  // Topological sort via Kahn's algorithm on the pruned DAG
  const inDegree = new Map<string, number>()
  for (const t of tables) inDegree.set(t.id, 0)
  for (const targets of dagAdj.values()) {
    for (const v of targets) inDegree.set(v, (inDegree.get(v) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const t of orderedSeeds) {
    if ((inDegree.get(t.id) ?? 0) === 0) queue.push(t.id)
  }

  const topoOrder: string[] = []
  while (queue.length > 0) {
    const u = queue.shift()!
    topoOrder.push(u)
    for (const v of dagAdj.get(u) ?? []) {
      const deg = (inDegree.get(v) ?? 0) - 1
      inDegree.set(v, deg)
      if (deg === 0) queue.push(v)
    }
  }

  // Compute longest-path rank for each node along child -> parent edges
  const rank = new Map<string, number>()
  for (const t of tables) rank.set(t.id, 0)
  for (const u of topoOrder) {
    const r = rank.get(u) ?? 0
    for (const v of dagAdj.get(u) ?? []) {
      if ((rank.get(v) ?? 0) < r + 1) rank.set(v, r + 1)
    }
  }

  const maxRank = Math.max(0, ...rank.values())
  const columns: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const t of tables) {
    columns[rank.get(t.id) ?? 0]!.push(t.id)
  }

  // Initial alphabetical order per column, followed by median/barycenter passes to cut crossings
  for (const col of columns) {
    col.sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name))
  }

  // Build reverse adjacency (parent -> children) for two-sided barycenter smoothing
  const revAdj = new Map<string, string[]>()
  for (const t of tables) revAdj.set(t.id, [])
  for (const [u, targets] of dagAdj.entries()) {
    for (const v of targets) revAdj.get(v)!.push(u)
  }

  const orderIndex = new Map<string, number>()
  const refreshOrder = () => {
    for (const col of columns) {
      col.forEach((id, idx) => orderIndex.set(id, idx))
    }
  }
  refreshOrder()

  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < columns.length; r++) {
      columns[r]!.sort((a, b) => {
        const score = (id: string): number => {
          const neighbors = [...(dagAdj.get(id) ?? []), ...(revAdj.get(id) ?? [])]
          if (neighbors.length === 0) return orderIndex.get(id) ?? 0
          return neighbors.reduce((sum, n) => sum + (orderIndex.get(n) ?? 0), 0) / neighbors.length
        }
        const diff = score(a) - score(b)
        return diff !== 0 ? diff : byId.get(a)!.name.localeCompare(byId.get(b)!.name)
      })
      refreshOrder()
    }
  }

  // Place each column left-to-right based on actual max block width + column gap
  let cursorX = ORIGIN_X
  for (const col of columns) {
    if (col.length === 0) continue
    let cursorY = ORIGIN_Y
    let maxColWidth: number = BLOCK.width

    for (const id of col) {
      const t = byId.get(id)!
      const w = t.width ?? BLOCK.width
      const h = t.height ?? estimateTableHeight(t.columns.length)
      if (w > maxColWidth) maxColWidth = w
      tablePositions[id] = { x: snap(cursorX), y: snap(cursorY) }
      cursorY += h + ROW_GAP
    }

    cursorX = snap(cursorX + maxColWidth + COLUMN_GAP)
  }

  // Place enums in a clean dedicated column on the right
  if (enums.length > 0) {
    const sortedEnums = [...enums].sort((a, b) => a.name.localeCompare(b.name))
    let enumY = ORIGIN_Y
    for (const e of sortedEnums) {
      const h = e.height ?? estimateEnumHeight(e.valuesCount)
      enumPositions[e.id] = { x: snap(cursorX), y: snap(enumY) }
      enumY += h + ROW_GAP
    }
  }

  return { tablePositions, enumPositions }
}

/**
 * Aligns or distributes 2+ selected nodes relative to their bounding box.
 */
export function alignNodes(items: readonly AlignableNode[], mode: AlignmentMode): Record<string, XY> {
  const result: Record<string, XY> = {}
  if (items.length < 2) return result

  const minX = Math.min(...items.map(n => n.x))
  const minY = Math.min(...items.map(n => n.y))
  const maxRight = Math.max(...items.map(n => n.x + n.width))
  const maxBottom = Math.max(...items.map(n => n.y + n.height))
  const midX = (minX + maxRight) / 2
  const midY = (minY + maxBottom) / 2

  if (mode === 'distributeH' && items.length >= 3) {
    const sorted = [...items].sort((a, b) => a.x - b.x)
    const totalW = sorted.reduce((acc, n) => acc + n.width, 0)
    const span = maxRight - minX
    const gap = (span - totalW) / (sorted.length - 1)
    let cursor = minX
    for (const n of sorted) {
      result[n.id] = { x: Math.round(cursor), y: n.y }
      cursor += n.width + gap
    }
    return result
  }

  if (mode === 'distributeV' && items.length >= 3) {
    const sorted = [...items].sort((a, b) => a.y - b.y)
    const totalH = sorted.reduce((acc, n) => acc + n.height, 0)
    const span = maxBottom - minY
    const gap = (span - totalH) / (sorted.length - 1)
    let cursor = minY
    for (const n of sorted) {
      result[n.id] = { x: n.x, y: Math.round(cursor) }
      cursor += n.height + gap
    }
    return result
  }

  for (const n of items) {
    switch (mode) {
      case 'left':
        result[n.id] = { x: Math.round(minX), y: n.y }
        break
      case 'centerX':
        result[n.id] = { x: Math.round(midX - n.width / 2), y: n.y }
        break
      case 'right':
        result[n.id] = { x: Math.round(maxRight - n.width), y: n.y }
        break
      case 'top':
        result[n.id] = { x: n.x, y: Math.round(minY) }
        break
      case 'centerY':
        result[n.id] = { x: n.x, y: Math.round(midY - n.height / 2) }
        break
      case 'bottom':
        result[n.id] = { x: n.x, y: Math.round(maxBottom - n.height) }
        break
      default:
        result[n.id] = { x: n.x, y: n.y }
    }
  }
  return result
}
