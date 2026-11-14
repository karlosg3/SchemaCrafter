import type { XY } from '../types/workspace'
import { BLOCK } from './graph'

export interface LayoutColumnInput {
  id?: string
  type?: string
  enumName?: string
  foreignKey?: {
    targetTableId: string
    targetColumnId?: string
  }
}

export interface LayoutTableInput {
  id: string
  name: string
  columns: ReadonlyArray<LayoutColumnInput>
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
const BASE_COLUMN_GAP = 160
const DENSE_EDGE_GAP = 192
const VERY_DENSE_EDGE_GAP = 224
const STUB_COLUMN_GAP = 256
const ENUM_COLUMN_GAP = 160
const ROW_GAP = 48
const COMPONENT_GAP = 80
const DUMMY_HEIGHT = 24
const DUMMY_GAP = 24

function snap(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP
}

function snapCeil(value: number): number {
  return Math.ceil(value / GRID_STEP) * GRID_STEP
}

function estimateTableHeight(columnCount: number): number {
  return BLOCK.headerHeight + columnCount * BLOCK.rowHeight + BLOCK.footerHeight + BLOCK.borderWidth * 2
}

function estimateEnumHeight(valuesCount = 3): number {
  return BLOCK.headerHeight + valuesCount * BLOCK.rowHeightEnum + BLOCK.footerHeight + BLOCK.borderWidth * 2
}

interface RawFkEdge {
  id: number
  source: string
  target: string
  srcOffset: number
  dstOffset: number
  srcRatio: number
  dstRatio: number
}

interface EnumLink {
  tableId: string
  enumId: string
  srcOffset: number
}

interface SchemaRelations {
  tableById: Map<string, LayoutTableInput>
  tableDims: Map<string, { width: number, height: number }>
  enumDims: Map<string, { width: number, height: number }>
  fkEdges: RawFkEdge[]
  enumLinks: EnumLink[]
  tableEnumIds: Map<string, Set<string>>
  hasExternalFk: Set<string>
}

interface LayeredSegment {
  leftId: string
  rightId: string
  leftPortRatio: number
  rightPortRatio: number
  leftPortOffset: number
  rightPortOffset: number
}

interface LayerNodeMeta {
  id: string
  name: string
  isDummy: boolean
  width: number
  height: number
}

function columnPortOffset(table: LayoutTableInput, colIndex: number, blockHeight: number): number {
  if (colIndex < 0 || colIndex >= table.columns.length) {
    return table.columns.length === 0 ? blockHeight / 2 : BLOCK.headerHeight + BLOCK.rowHeight / 2
  }
  return BLOCK.headerHeight + colIndex * BLOCK.rowHeight + BLOCK.rowHeight / 2
}

function findTargetColumnIndex(target: LayoutTableInput, targetColumnId?: string): number {
  if (!targetColumnId) return 0
  const idx = target.columns.findIndex(col => col.id === targetColumnId)
  return idx >= 0 ? idx : 0
}

/**
 * Extracts internal FK edges with source/target handle Y offsets, cross-schema FK flags,
 * and ENUM usage references.
 */
function extractSchemaRelations(
  tables: readonly LayoutTableInput[],
  enums: readonly LayoutEnumInput[]
): SchemaRelations {
  const tableById = new Map<string, LayoutTableInput>()
  const tableDims = new Map<string, { width: number, height: number }>()
  const enumDims = new Map<string, { width: number, height: number }>()
  const enumByName = new Map<string, LayoutEnumInput>()

  for (const t of tables) {
    tableById.set(t.id, t)
    tableDims.set(t.id, {
      width: t.width ?? BLOCK.width,
      height: t.height ?? estimateTableHeight(t.columns.length)
    })
  }

  for (const e of enums) {
    enumByName.set(e.name, e)
    enumDims.set(e.id, {
      width: e.width ?? BLOCK.widthEnum,
      height: e.height ?? estimateEnumHeight(e.valuesCount)
    })
  }

  const fkEdges: RawFkEdge[] = []
  const enumLinks: EnumLink[] = []
  const tableEnumIds = new Map<string, Set<string>>()
  const hasExternalFk = new Set<string>()
  let edgeSeq = 0

  for (const t of tables) {
    const srcDims = tableDims.get(t.id)!
    t.columns.forEach((col, rowIdx) => {
      const srcOffset = columnPortOffset(t, rowIdx, srcDims.height)

      if (col.foreignKey) {
        const targetId = col.foreignKey.targetTableId
        const target = tableById.get(targetId)
        if (!target) {
          hasExternalFk.add(t.id)
        } else if (targetId !== t.id) {
          const dstDims = tableDims.get(targetId)!
          const dstIdx = findTargetColumnIndex(target, col.foreignKey.targetColumnId)
          const dstOffset = columnPortOffset(target, dstIdx, dstDims.height)
          fkEdges.push({
            id: edgeSeq++,
            source: t.id,
            target: targetId,
            srcOffset,
            dstOffset,
            srcRatio: srcDims.height > 0 ? srcOffset / srcDims.height : 0.5,
            dstRatio: dstDims.height > 0 ? dstOffset / dstDims.height : 0.5
          })
        }
      }

      if (col.type === 'ENUM' && col.enumName) {
        const enumDef = enumByName.get(col.enumName)
        if (enumDef) {
          enumLinks.push({ tableId: t.id, enumId: enumDef.id, srcOffset })
          let set = tableEnumIds.get(t.id)
          if (!set) {
            set = new Set<string>()
            tableEnumIds.set(t.id, set)
          }
          set.add(enumDef.id)
        }
      }
    })
  }

  return { tableById, tableDims, enumDims, fkEdges, enumLinks, tableEnumIds, hasExternalFk }
}

/**
 * Partitions tables into weakly connected relationship clusters (bridging FKs and shared Enums)
 * plus completely unlinked standalone tables.
 */
function partitionComponents(
  tables: readonly LayoutTableInput[],
  relations: SchemaRelations
): { relational: LayoutTableInput[][], standalone: LayoutTableInput[] } {
  const parent = new Map<string, string>()
  for (const t of tables) parent.set(t.id, t.id)

  const find = (x: string): string => {
    let cur = x
    while (parent.get(cur) !== cur) {
      cur = parent.get(cur)!
    }
    let walker = x
    while (walker !== cur) {
      const next = parent.get(walker)!
      parent.set(walker, cur)
      walker = next
    }
    return cur
  }

  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  for (const edge of relations.fkEdges) {
    union(edge.source, edge.target)
  }

  const tablesByEnum = new Map<string, string[]>()
  for (const link of relations.enumLinks) {
    const list = tablesByEnum.get(link.enumId)
    if (list) list.push(link.tableId)
    else tablesByEnum.set(link.enumId, [link.tableId])
  }
  for (const group of tablesByEnum.values()) {
    for (let i = 1; i < group.length; i++) {
      union(group[0]!, group[i]!)
    }
  }

  const groups = new Map<string, LayoutTableInput[]>()
  for (const t of tables) {
    const root = find(t.id)
    const bucket = groups.get(root)
    if (bucket) bucket.push(t)
    else groups.set(root, [t])
  }

  const edgeCountByTable = new Map<string, number>()
  for (const e of relations.fkEdges) {
    edgeCountByTable.set(e.source, (edgeCountByTable.get(e.source) ?? 0) + 1)
    edgeCountByTable.set(e.target, (edgeCountByTable.get(e.target) ?? 0) + 1)
  }
  for (const link of relations.enumLinks) {
    edgeCountByTable.set(link.tableId, (edgeCountByTable.get(link.tableId) ?? 0) + 1)
  }

  const relational: LayoutTableInput[][] = []
  const standalone: LayoutTableInput[] = []

  for (const group of groups.values()) {
    const hasAnyRelation = group.length > 1 || group.some(t =>
      (edgeCountByTable.get(t.id) ?? 0) > 0 || relations.hasExternalFk.has(t.id)
    )
    if (hasAnyRelation) {
      relational.push(group)
    } else {
      standalone.push(...group)
    }
  }

  const scoreGroup = (group: LayoutTableInput[]): { links: number, size: number, first: string } => {
    let links = 0
    let first = group[0]?.name ?? ''
    for (const t of group) {
      links += (edgeCountByTable.get(t.id) ?? 0) + (relations.hasExternalFk.has(t.id) ? 1 : 0)
      if (t.name.localeCompare(first) < 0) first = t.name
    }
    return { links, size: group.length, first }
  }

  relational.sort((a, b) => {
    const sa = scoreGroup(a)
    const sb = scoreGroup(b)
    if (sb.links !== sa.links) return sb.links - sa.links
    if (sb.size !== sa.size) return sb.size - sa.size
    return sa.first.localeCompare(sb.first)
  })
  standalone.sort((a, b) => a.name.localeCompare(b.name))

  return { relational, standalone }
}

/**
 * Computes a cycle-free linear ordering via Eades-Lin-Smyth greedy heuristic so core
 * parent hubs (high in-degree) stay on the right and feedback cycles break minimal edges.
 */
function orientAcyclicEdges(
  compTables: readonly LayoutTableInput[],
  compEdges: readonly RawFkEdge[],
  byId: Map<string, LayoutTableInput>
): { forwardSet: Set<number>, dagOut: Map<string, string[]>, dagIn: Map<string, string[]> } {
  const remaining = new Set(compTables.map(t => t.id))
  const outWeights = new Map<string, Map<string, number>>()
  const inWeights = new Map<string, Map<string, number>>()
  const outSum = new Map<string, number>()
  const inSum = new Map<string, number>()

  for (const t of compTables) {
    outWeights.set(t.id, new Map())
    inWeights.set(t.id, new Map())
    outSum.set(t.id, 0)
    inSum.set(t.id, 0)
  }

  for (const e of compEdges) {
    const ow = outWeights.get(e.source)!
    ow.set(e.target, (ow.get(e.target) ?? 0) + 1)
    outSum.set(e.source, (outSum.get(e.source) ?? 0) + 1)

    const iw = inWeights.get(e.target)!
    iw.set(e.source, (iw.get(e.source) ?? 0) + 1)
    inSum.set(e.target, (inSum.get(e.target) ?? 0) + 1)
  }

  // Retain full-component degree balance so hubs inside cycles still stay to the right
  const initialOutSum = new Map(outSum)
  const initialInSum = new Map(inSum)

  const removeNode = (u: string) => {
    remaining.delete(u)
    for (const [v, w] of outWeights.get(u)!) {
      if (remaining.has(v)) {
        inSum.set(v, (inSum.get(v) ?? 0) - w)
        inWeights.get(v)?.delete(u)
      }
    }
    for (const [p, w] of inWeights.get(u)!) {
      if (remaining.has(p)) {
        outSum.set(p, (outSum.get(p) ?? 0) - w)
        outWeights.get(p)?.delete(u)
      }
    }
  }

  const leftOrder: string[] = []
  const rightOrder: string[] = []
  const cmpName = (a: string, b: string) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)

  while (remaining.size > 0) {
    const sinks: string[] = []
    const sources: string[] = []
    for (const u of remaining) {
      if ((outSum.get(u) ?? 0) === 0) sinks.push(u)
      else if ((inSum.get(u) ?? 0) === 0) sources.push(u)
    }

    if (sinks.length > 0) {
      sinks.sort(cmpName)
      const pick = sinks[0]!
      rightOrder.push(pick)
      removeNode(pick)
      continue
    }

    if (sources.length > 0) {
      sources.sort(cmpName)
      const pick = sources[0]!
      leftOrder.push(pick)
      removeNode(pick)
      continue
    }

    let bestId = ''
    let bestDelta = -Infinity
    let bestGlobalDelta = -Infinity
    let bestOut = -1
    for (const u of remaining) {
      const o = outSum.get(u) ?? 0
      const delta = o - (inSum.get(u) ?? 0)
      const globalDelta = (initialOutSum.get(u) ?? 0) - (initialInSum.get(u) ?? 0)
      const isBetter = delta > bestDelta
        || (delta === bestDelta && (
          globalDelta > bestGlobalDelta
          || (globalDelta === bestGlobalDelta && (o > bestOut || (o === bestOut && cmpName(u, bestId) < 0)))
        ))
      if (isBetter) {
        bestId = u
        bestDelta = delta
        bestGlobalDelta = globalDelta
        bestOut = o
      }
    }
    leftOrder.push(bestId)
    removeNode(bestId)
  }

  const linearPos = new Map<string, number>()
  const combined = [...leftOrder, ...rightOrder.reverse()]
  combined.forEach((id, idx) => linearPos.set(id, idx))

  const forwardSet = new Set<number>()
  const dagOut = new Map<string, string[]>()
  const dagIn = new Map<string, string[]>()
  for (const t of compTables) {
    dagOut.set(t.id, [])
    dagIn.set(t.id, [])
  }

  const seenPair = new Set<string>()
  for (const e of compEdges) {
    if ((linearPos.get(e.source) ?? 0) < (linearPos.get(e.target) ?? 0)) {
      forwardSet.add(e.id)
      const key = `${e.source}->${e.target}`
      if (!seenPair.has(key)) {
        seenPair.add(key)
        dagOut.get(e.source)!.push(e.target)
        dagIn.get(e.target)!.push(e.source)
      }
    }
  }

  return { forwardSet, dagOut, dagIn }
}

/**
 * Assigns compact DAG ranks: longest topological depth from sources followed by
 * bidirectional convex median tightening to pull short leaf edges close to their targets.
 */
function assignComponentRanks(
  compTables: readonly LayoutTableInput[],
  dagOut: Map<string, string[]>,
  dagIn: Map<string, string[]>,
  byId: Map<string, LayoutTableInput>
): Map<string, number> {
  const remainingIn = new Map<string, number>()
  for (const t of compTables) remainingIn.set(t.id, (dagIn.get(t.id) ?? []).length)

  const queue = compTables
    .filter(t => (remainingIn.get(t.id) ?? 0) === 0)
    .map(t => t.id)
    .sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name))

  const topoOrder: string[] = []
  while (queue.length > 0) {
    const u = queue.shift()!
    topoOrder.push(u)
    for (const v of dagOut.get(u) ?? []) {
      const next = (remainingIn.get(v) ?? 0) - 1
      remainingIn.set(v, next)
      if (next === 0) queue.push(v)
    }
  }

  const rank = new Map<string, number>()
  for (const t of compTables) rank.set(t.id, 0)
  for (const u of topoOrder) {
    const r = rank.get(u) ?? 0
    for (const v of dagOut.get(u) ?? []) {
      if ((rank.get(v) ?? 0) < r + 1) rank.set(v, r + 1)
    }
  }

  // Pull nodes horizontally closer to neighbors when doing so decreases total edge column span
  const updateRankTowardMedian = (u: string) => {
    const preds = dagIn.get(u) ?? []
    const succs = dagOut.get(u) ?? []
    if (preds.length === 0 && succs.length === 0) return

    const minR = preds.length > 0 ? Math.max(...preds.map(p => (rank.get(p) ?? 0) + 1)) : 0
    const maxR = succs.length > 0 ? Math.min(...succs.map(v => (rank.get(v) ?? 0) - 1)) : (rank.get(u) ?? 0)
    if (minR > maxR) return

    const targets = [
      ...preds.map(p => (rank.get(p) ?? 0) + 1),
      ...succs.map(v => (rank.get(v) ?? 0) - 1)
    ].sort((a, b) => a - b)

    const upperMedian = targets[Math.floor(targets.length / 2)] ?? minR
    rank.set(u, Math.max(minR, Math.min(maxR, upperMedian)))
  }

  for (let pass = 0; pass < 3; pass++) {
    for (let i = topoOrder.length - 1; i >= 0; i--) updateRankTowardMedian(topoOrder[i]!)
    for (let i = 0; i < topoOrder.length; i++) updateRankTowardMedian(topoOrder[i]!)
  }

  // Normalize ranks to contiguous 0..L-1
  const occupied = [...new Set(rank.values())].sort((a, b) => a - b)
  const compact = new Map<number, number>()
  occupied.forEach((r, idx) => compact.set(r, idx))
  for (const [id, r] of rank.entries()) rank.set(id, compact.get(r) ?? 0)

  return rank
}

/**
 * Splits multi-column edges across intermediate layers using dummy corridor nodes so long wires
 * participate in crossing elimination and avoid passing behind intermediate tables.
 */
function buildLayeredGraph(
  compTables: readonly LayoutTableInput[],
  compEdges: readonly RawFkEdge[],
  rank: Map<string, number>,
  tableDims: Map<string, { width: number, height: number }>
): {
  layers: string[][]
  meta: Map<string, LayerNodeMeta>
  segmentsByLayer: LayeredSegment[][]
} {
  const maxRank = Math.max(0, ...rank.values())
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  const meta = new Map<string, LayerNodeMeta>()

  for (const t of compTables) {
    const dims = tableDims.get(t.id)!
    layers[rank.get(t.id) ?? 0]!.push(t.id)
    meta.set(t.id, { id: t.id, name: t.name, isDummy: false, width: dims.width, height: dims.height })
  }

  const segmentsByLayer: LayeredSegment[][] = Array.from({ length: maxRank }, () => [])

  for (const e of compEdges) {
    const rS = rank.get(e.source) ?? 0
    const rT = rank.get(e.target) ?? 0
    if (rS === rT) continue

    const leftToRight = rS < rT
    const rLeft = leftToRight ? rS : rT
    const rRight = leftToRight ? rT : rS
    const leftNodeId = leftToRight ? e.source : e.target
    const rightNodeId = leftToRight ? e.target : e.source
    const leftOffset = leftToRight ? e.srcOffset : e.dstOffset
    const rightOffset = leftToRight ? e.dstOffset : e.srcOffset
    const leftRatio = leftToRight ? e.srcRatio : e.dstRatio
    const rightRatio = leftToRight ? e.dstRatio : e.srcRatio

    if (rRight - rLeft === 1) {
      segmentsByLayer[rLeft]!.push({
        leftId: leftNodeId,
        rightId: rightNodeId,
        leftPortRatio: leftRatio,
        rightPortRatio: rightRatio,
        leftPortOffset: leftOffset,
        rightPortOffset: rightOffset
      })
      continue
    }

    let prevId = leftNodeId
    let prevRatio = leftRatio
    let prevOffset = leftOffset
    const span = rRight - rLeft

    for (let r = rLeft + 1; r < rRight; r++) {
      const dummyId = `__dummy_${e.id}_${r}`
      const tFrac = (r - rLeft) / span
      const interpRatio = leftRatio + (rightRatio - leftRatio) * tFrac
      layers[r]!.push(dummyId)
      meta.set(dummyId, {
        id: dummyId,
        name: dummyId,
        isDummy: true,
        width: 0,
        height: DUMMY_HEIGHT
      })
      segmentsByLayer[r - 1]!.push({
        leftId: prevId,
        rightId: dummyId,
        leftPortRatio: prevRatio,
        rightPortRatio: 0.5,
        leftPortOffset: prevOffset,
        rightPortOffset: DUMMY_HEIGHT / 2
      })
      prevId = dummyId
      prevRatio = interpRatio
      prevOffset = DUMMY_HEIGHT / 2
    }

    segmentsByLayer[rRight - 1]!.push({
      leftId: prevId,
      rightId: rightNodeId,
      leftPortRatio: prevRatio,
      rightPortRatio: rightRatio,
      leftPortOffset: prevOffset,
      rightPortOffset: rightOffset
    })
  }

  return { layers, meta, segmentsByLayer }
}

function countPairCrossings(
  leftOrder: readonly string[],
  rightOrder: readonly string[],
  segments: readonly LayeredSegment[]
): number {
  if (segments.length < 2) return 0
  const leftPos = new Map<string, number>()
  const rightPos = new Map<string, number>()
  leftOrder.forEach((id, i) => leftPos.set(id, i))
  rightOrder.forEach((id, i) => rightPos.set(id, i))

  const coords = segments
    .map(seg => ({
      l: (leftPos.get(seg.leftId) ?? 0) + seg.leftPortRatio * 0.85,
      r: (rightPos.get(seg.rightId) ?? 0) + seg.rightPortRatio * 0.85
    }))
    .sort((a, b) => a.l - b.l || a.r - b.r)

  let crossings = 0
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i]!
    for (let j = i + 1; j < coords.length; j++) {
      const b = coords[j]!
      if (a.l < b.l && a.r > b.r) crossings++
    }
  }
  return crossings
}

function computeEnumSpreadPenalty(
  layer: readonly string[],
  tableEnumIds: Map<string, Set<string>>
): number {
  const indicesByEnum = new Map<string, number[]>()
  layer.forEach((id, idx) => {
    const enums = tableEnumIds.get(id)
    if (!enums) return
    for (const enumId of enums) {
      const list = indicesByEnum.get(enumId)
      if (list) list.push(idx)
      else indicesByEnum.set(enumId, [idx])
    }
  })

  let penalty = 0
  for (const idxs of indicesByEnum.values()) {
    for (let i = 1; i < idxs.length; i++) {
      penalty += idxs[i]! - idxs[i - 1]! - 1
    }
  }
  return penalty
}

/**
 * Reorders nodes within each layer using BFS initial seeding, port-aware bidirectional
 * barycenter passes, and exact adjacent-pair transpose crossing elimination.
 */
function minimizeLayerCrossings(
  layers: string[][],
  segmentsByLayer: readonly LayeredSegment[][],
  meta: Map<string, LayerNodeMeta>,
  tableEnumIds: Map<string, Set<string>>
): void {
  if (layers.length === 0) return

  // Build undirected adjacency across adjacent layer segments for cohesive initial BFS seeding
  const neighbors = new Map<string, string[]>()
  for (const layer of layers) {
    for (const id of layer) neighbors.set(id, [])
  }
  for (const segs of segmentsByLayer) {
    for (const seg of segs) {
      neighbors.get(seg.leftId)?.push(seg.rightId)
      neighbors.get(seg.rightId)?.push(seg.leftId)
    }
  }

  const visitOrder = new Map<string, number>()
  let visitTick = 0
  const allSeeds = layers
    .flat()
    .sort((a, b) => {
      const degDiff = (neighbors.get(b)?.length ?? 0) - (neighbors.get(a)?.length ?? 0)
      if (degDiff !== 0) return degDiff
      return meta.get(a)!.name.localeCompare(meta.get(b)!.name)
    })

  for (const seed of allSeeds) {
    if (visitOrder.has(seed)) continue
    const queue = [seed]
    visitOrder.set(seed, visitTick++)
    while (queue.length > 0) {
      const u = queue.shift()!
      const nexts = [...(neighbors.get(u) ?? [])].sort((a, b) => meta.get(a)!.name.localeCompare(meta.get(b)!.name))
      for (const v of nexts) {
        if (!visitOrder.has(v)) {
          visitOrder.set(v, visitTick++)
          queue.push(v)
        }
      }
    }
  }

  for (const col of layers) {
    col.sort((a, b) => (visitOrder.get(a) ?? 0) - (visitOrder.get(b) ?? 0))
  }

  const totalCost = (): { crossings: number, penalty: number } => {
    let crossings = 0
    for (let r = 0; r < segmentsByLayer.length; r++) {
      crossings += countPairCrossings(layers[r]!, layers[r + 1]!, segmentsByLayer[r]!)
    }
    let penalty = 0
    for (const layer of layers) penalty += computeEnumSpreadPenalty(layer, tableEnumIds)
    return { crossings, penalty }
  }

  const localCostAtLayer = (r: number): { crossings: number, penalty: number } => {
    let crossings = 0
    if (r > 0) crossings += countPairCrossings(layers[r - 1]!, layers[r]!, segmentsByLayer[r - 1]!)
    if (r < segmentsByLayer.length) crossings += countPairCrossings(layers[r]!, layers[r + 1]!, segmentsByLayer[r]!)
    return { crossings, penalty: computeEnumSpreadPenalty(layers[r]!, tableEnumIds) }
  }

  const barycenterSort = (r: number, fromLeft: boolean) => {
    const col = layers[r]!
    if (col.length < 2) return
    const adjLayer = fromLeft ? layers[r - 1]! : layers[r + 1]!
    const segs = fromLeft ? segmentsByLayer[r - 1]! : segmentsByLayer[r]!
    const adjPos = new Map<string, number>()
    adjLayer.forEach((id, i) => adjPos.set(id, i))

    const curPos = new Map<string, number>()
    col.forEach((id, i) => curPos.set(id, i))

    const scoreMap = new Map<string, number>()
    for (const id of col) {
      let sum = 0
      let count = 0
      for (const seg of segs) {
        const isMatch = fromLeft ? seg.rightId === id : seg.leftId === id
        if (!isMatch) continue
        const otherId = fromLeft ? seg.leftId : seg.rightId
        const otherRatio = fromLeft ? seg.leftPortRatio : seg.rightPortRatio
        const selfRatio = fromLeft ? seg.rightPortRatio : seg.leftPortRatio
        const pos = adjPos.get(otherId) ?? 0
        sum += pos + otherRatio * 0.42 - selfRatio * 0.12
        count++
      }
      scoreMap.set(id, count > 0 ? sum / count : (curPos.get(id) ?? 0))
    }

    col.sort((a, b) => {
      const diff = (scoreMap.get(a) ?? 0) - (scoreMap.get(b) ?? 0)
      if (Math.abs(diff) > 1e-6) return diff
      return (curPos.get(a) ?? 0) - (curPos.get(b) ?? 0)
    })
  }

  const transposePass = () => {
    for (let iter = 0; iter < 4; iter++) {
      let improved = false
      for (let r = 0; r < layers.length; r++) {
        const col = layers[r]!
        for (let i = 0; i < col.length - 1; i++) {
          const before = localCostAtLayer(r)
          const a = col[i]!
          const b = col[i + 1]!
          col[i] = b
          col[i + 1] = a
          const after = localCostAtLayer(r)
          const better = after.crossings < before.crossings
            || (after.crossings === before.crossings && after.penalty < before.penalty)
          if (better) {
            improved = true
          } else {
            col[i] = a
            col[i + 1] = b
          }
        }
      }
      if (!improved) break
    }
  }

  transposePass()
  let best = totalCost()
  let bestSnapshot = layers.map(col => [...col])

  for (let pass = 0; pass < 6; pass++) {
    for (let r = 1; r < layers.length; r++) barycenterSort(r, true)
    for (let r = layers.length - 2; r >= 0; r--) barycenterSort(r, false)
    transposePass()

    const cur = totalCost()
    const isBetter = cur.crossings < best.crossings
      || (cur.crossings === best.crossings && cur.penalty < best.penalty)
    if (isBetter) {
      best = cur
      bestSnapshot = layers.map(col => [...col])
    }
  }

  bestSnapshot.forEach((saved, r) => {
    layers[r] = saved
  })
}

/**
 * Exact O(k) Pool Adjacent Violators Algorithm (PAVA) solver finding minimum-displacement Y
 * coordinates satisfying strict vertical ordering and gap constraints without overlaps.
 */
function solveIsotonicNoOverlap(
  heights: readonly number[],
  gaps: readonly number[],
  idealYs: readonly number[],
  weights: readonly number[]
): number[] {
  const n = heights.length
  if (n === 0) return []

  const offsets = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    offsets[i] = offsets[i - 1]! + heights[i - 1]! + gaps[i - 1]!
  }

  interface Block {
    start: number
    end: number
    sumWZ: number
    sumW: number
  }

  const stack: Block[] = []
  for (let i = 0; i < n; i++) {
    const w = Math.max(0.01, weights[i] ?? 1)
    const targetZ = (idealYs[i] ?? 0) - offsets[i]!
    const block: Block = { start: i, end: i, sumWZ: w * targetZ, sumW: w }
    stack.push(block)

    while (stack.length >= 2) {
      const top = stack[stack.length - 1]!
      const prev = stack[stack.length - 2]!
      if (prev.sumWZ / prev.sumW > top.sumWZ / top.sumW) {
        prev.end = top.end
        prev.sumWZ += top.sumWZ
        prev.sumW += top.sumW
        stack.pop()
      } else {
        break
      }
    }
  }

  const out = new Array<number>(n).fill(0)
  for (const block of stack) {
    const z = block.sumWZ / block.sumW
    for (let i = block.start; i <= block.end; i++) {
      out[i] = z + offsets[i]!
    }
  }
  return out
}

function blendedMedianMean(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length
  return 0.6 * median + 0.4 * mean
}

/**
 * Computes continuous handle-aligned Y coordinates across component layers, then shifts and
 * snaps all real tables onto the 16px grid while guaranteeing zero overlaps.
 */
function assignComponentPositions(
  layers: readonly (readonly string[])[],
  segmentsByLayer: readonly LayeredSegment[][],
  meta: Map<string, LayerNodeMeta>,
  hasExternalFk: Set<string>,
  startY: number,
  tablePositions: Record<string, XY>
): { maxBottomY: number, rightmostEdgeWithGap: number } {
  const yMap = new Map<string, number>()

  // Center every column vertically around 0 as symmetric initialization
  let anchorLayer = 0
  let bestAnchorWeight = -1
  for (let r = 0; r < layers.length; r++) {
    const col = layers[r]!
    let totalH = 0
    for (let i = 0; i < col.length; i++) {
      const m = meta.get(col[i]!)!
      totalH += m.height
      if (i > 0) {
        const prevIsDummy = meta.get(col[i - 1]!)!.isDummy
        totalH += m.isDummy || prevIsDummy ? DUMMY_GAP : ROW_GAP
      }
    }
    let cur = -totalH / 2
    for (let i = 0; i < col.length; i++) {
      const m = meta.get(col[i]!)!
      yMap.set(col[i]!, cur)
      if (i + 1 < col.length) {
        const nextIsDummy = meta.get(col[i + 1]!)!.isDummy
        cur += m.height + (m.isDummy || nextIsDummy ? DUMMY_GAP : ROW_GAP)
      }
    }
    if (totalH > bestAnchorWeight) {
      bestAnchorWeight = totalH
      anchorLayer = r
    }
  }

  const alignLayer = (r: number, neighborMode: 'left' | 'right' | 'both') => {
    const col = layers[r]!
    if (col.length === 0) return

    const heights: number[] = []
    const gaps: number[] = []
    const idealYs: number[] = []
    const weights: number[] = []

    for (let i = 0; i < col.length; i++) {
      const id = col[i]!
      const node = meta.get(id)!
      heights.push(node.height)
      if (i + 1 < col.length) {
        const nextDummy = meta.get(col[i + 1]!)!.isDummy
        gaps.push(node.isDummy || nextDummy ? DUMMY_GAP : ROW_GAP)
      }

      const targets: number[] = []
      if ((neighborMode === 'left' || neighborMode === 'both') && r > 0) {
        for (const seg of segmentsByLayer[r - 1]!) {
          if (seg.rightId === id) {
            const leftY = yMap.get(seg.leftId) ?? 0
            targets.push(leftY + seg.leftPortOffset - seg.rightPortOffset)
          }
        }
      }
      if ((neighborMode === 'right' || neighborMode === 'both') && r < segmentsByLayer.length) {
        for (const seg of segmentsByLayer[r]!) {
          if (seg.leftId === id) {
            const rightY = yMap.get(seg.rightId) ?? 0
            targets.push(rightY + seg.rightPortOffset - seg.leftPortOffset)
          }
        }
      }

      if (targets.length > 0) {
        idealYs.push(blendedMedianMean(targets))
        weights.push(node.isDummy ? 0.5 : targets.length)
      } else {
        idealYs.push(yMap.get(id) ?? 0)
        weights.push(0.05)
      }
    }

    const solved = solveIsotonicNoOverlap(heights, gaps, idealYs, weights)
    col.forEach((id, i) => yMap.set(id, solved[i]!))
  }

  for (let r = anchorLayer + 1; r < layers.length; r++) alignLayer(r, 'left')
  for (let r = anchorLayer - 1; r >= 0; r--) alignLayer(r, 'right')

  for (let pass = 0; pass < 4; pass++) {
    for (let r = 0; r < layers.length; r++) alignLayer(r, 'both')
    for (let r = layers.length - 1; r >= 0; r--) alignLayer(r, 'both')
  }

  // Adaptive horizontal column spacing (wider gaps for high density & cross-schema stubs)
  const colX: number[] = []
  let cursorX = ORIGIN_X
  let rightmostEdgeWithGap = ORIGIN_X

  for (let r = 0; r < layers.length; r++) {
    colX.push(snap(cursorX))
    let maxColWidth: number = BLOCK.width
    let externalStub = false
    for (const id of layers[r]!) {
      const m = meta.get(id)!
      if (m.isDummy) continue
      if (m.width > maxColWidth) maxColWidth = m.width
      if (hasExternalFk.has(id)) externalStub = true
    }

    const colRight = colX[r]! + maxColWidth
    const clearance = colRight + (externalStub ? STUB_COLUMN_GAP : ENUM_COLUMN_GAP)
    if (clearance > rightmostEdgeWithGap) rightmostEdgeWithGap = clearance

    const edgesToRight = r < segmentsByLayer.length ? segmentsByLayer[r]!.length : 0
    let gap = externalStub ? STUB_COLUMN_GAP : BASE_COLUMN_GAP
    if (!externalStub) {
      if (edgesToRight >= 7) gap = VERY_DENSE_EDGE_GAP
      else if (edgesToRight >= 4) gap = DENSE_EDGE_GAP
    }
    cursorX = snap(colRight + gap)
  }

  // Shift component globally so relative wire alignment stays flat while clearing previous bands
  let minRealY = Infinity
  for (const col of layers) {
    for (const id of col) {
      if (meta.get(id)!.isDummy) continue
      const y = yMap.get(id) ?? 0
      if (y < minRealY) minRealY = y
    }
  }
  const shiftDelta = Number.isFinite(minRealY) ? snapCeil(startY - minRealY) : 0

  let maxBottomY = startY
  for (let r = 0; r < layers.length; r++) {
    let prevRealBottom = -Infinity
    for (const id of layers[r]!) {
      const m = meta.get(id)!
      if (m.isDummy) continue
      const desired = snap((yMap.get(id) ?? 0) + shiftDelta)
      const minAllowed = prevRealBottom === -Infinity ? snap(startY) : snapCeil(prevRealBottom + ROW_GAP)
      const finalY = Math.max(desired, minAllowed)
      tablePositions[id] = { x: colX[r]!, y: finalY }
      prevRealBottom = finalY + m.height
      if (prevRealBottom > maxBottomY) maxBottomY = prevRealBottom
    }
  }

  return { maxBottomY, rightmostEdgeWithGap }
}

/**
 * Places unlinked standalone tables: keeps 1-column vertical order when standalone tables are the
 * only content in a tiny schema, and wraps into compact horizontal grid rows below connected clusters.
 */
function placeStandaloneTables(
  standalone: readonly LayoutTableInput[],
  relations: SchemaRelations,
  startY: number,
  preferGrid: boolean,
  tablePositions: Record<string, XY>
): { maxBottomY: number, rightmostEdgeWithGap: number } {
  if (standalone.length === 0) {
    return { maxBottomY: startY, rightmostEdgeWithGap: ORIGIN_X }
  }

  const maxPerRow = preferGrid ? Math.min(3, standalone.length) : 1
  const colWidths = new Array<number>(maxPerRow).fill(BLOCK.width)
  standalone.forEach((t, idx) => {
    const colIdx = idx % maxPerRow
    const w = relations.tableDims.get(t.id)!.width
    if (w > colWidths[colIdx]!) colWidths[colIdx] = w
  })

  const colX = new Array<number>(maxPerRow).fill(ORIGIN_X)
  for (let c = 1; c < maxPerRow; c++) {
    colX[c] = snap(colX[c - 1]! + colWidths[c - 1]! + BASE_COLUMN_GAP)
  }

  let curY = snap(startY)
  let maxBottomY = curY
  let rightmostEdgeWithGap = ORIGIN_X

  for (let rowStart = 0; rowStart < standalone.length; rowStart += maxPerRow) {
    let rowMaxHeight = 0
    for (let c = 0; c < maxPerRow && rowStart + c < standalone.length; c++) {
      const t = standalone[rowStart + c]!
      const dims = relations.tableDims.get(t.id)!
      const x = colX[c]!
      tablePositions[t.id] = { x, y: curY }
      const gap = relations.hasExternalFk.has(t.id) ? STUB_COLUMN_GAP : ENUM_COLUMN_GAP
      rightmostEdgeWithGap = Math.max(rightmostEdgeWithGap, x + dims.width + gap)
      if (dims.height > rowMaxHeight) rowMaxHeight = dims.height
    }
    maxBottomY = curY + rowMaxHeight
    curY = snapCeil(maxBottomY + ROW_GAP)
  }

  return { maxBottomY, rightmostEdgeWithGap }
}

/**
 * Places Enum blocks in a unified right-hand column vertically aligned to the table columns
 * that reference them, with unreferenced enums stacked cleanly below.
 */
function placeAlignedEnums(
  enums: readonly LayoutEnumInput[],
  relations: SchemaRelations,
  tablePositions: Record<string, XY>,
  enumX: number,
  enumPositions: Record<string, XY>
): void {
  if (enums.length === 0) return

  const linksByEnum = new Map<string, EnumLink[]>()
  for (const link of relations.enumLinks) {
    const list = linksByEnum.get(link.enumId)
    if (list) list.push(link)
    else linksByEnum.set(link.enumId, [link])
  }

  const used: { item: LayoutEnumInput, idealY: number, height: number }[] = []
  const unused: LayoutEnumInput[] = []

  for (const e of enums) {
    const dims = relations.enumDims.get(e.id)!
    const refs = linksByEnum.get(e.id)
    if (!refs || refs.length === 0) {
      unused.push(e)
      continue
    }
    const desiredTops = refs
      .map(link => {
        const tablePos = tablePositions[link.tableId]
        return tablePos ? tablePos.y + link.srcOffset - dims.height / 2 : ORIGIN_Y
      })
    used.push({ item: e, idealY: blendedMedianMean(desiredTops), height: dims.height })
  }

  let nextEnumY = ORIGIN_Y
  if (used.length > 0) {
    used.sort((a, b) => a.idealY - b.idealY || a.item.name.localeCompare(b.item.name))
    const solved = solveIsotonicNoOverlap(
      used.map(u => u.height),
      used.slice(0, -1).map(() => ROW_GAP),
      used.map(u => Math.max(ORIGIN_Y, u.idealY)),
      used.map(u => linksByEnum.get(u.item.id)!.length)
    )

    let prevBottom = -Infinity
    used.forEach((entry, idx) => {
      const desired = snap(solved[idx]!)
      const minAllowed = prevBottom === -Infinity ? ORIGIN_Y : snapCeil(prevBottom + ROW_GAP)
      const finalY = Math.max(desired, minAllowed)
      enumPositions[entry.item.id] = { x: snap(enumX), y: finalY }
      prevBottom = finalY + entry.height
    })
    nextEnumY = snapCeil(prevBottom + ROW_GAP)
  }

  if (unused.length > 0) {
    unused.sort((a, b) => a.name.localeCompare(b.name))
    let curY = nextEnumY
    for (const e of unused) {
      const h = relations.enumDims.get(e.id)!.height
      enumPositions[e.id] = { x: snap(enumX), y: curY }
      curY = snapCeil(curY + h + ROW_GAP)
    }
  }
}

/**
 * Computes a relationship-aware layered DAG layout aligned to Vue Flow's right-source -> left-target
 * handle flow. Clusters connected components, tightens edge spans, routes multi-rank wires via
 * dummy corridors, minimizes port-level crossings, aligns connected handle Y coordinates, and keeps
 * enums and cross-schema FK stubs free of overlap.
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

  const relations = extractSchemaRelations(tables, enums)
  const { relational, standalone } = partitionComponents(tables, relations)

  let cursorY = ORIGIN_Y
  let maxRightEdgeWithGap = tables.length === 0 ? ORIGIN_X : 0

  for (const compTables of relational) {
    const compSet = new Set(compTables.map(t => t.id))
    const compEdges = relations.fkEdges.filter(e => compSet.has(e.source) && compSet.has(e.target))

    const { dagOut, dagIn } = orientAcyclicEdges(compTables, compEdges, relations.tableById)
    const rank = assignComponentRanks(compTables, dagOut, dagIn, relations.tableById)
    const { layers, meta, segmentsByLayer } = buildLayeredGraph(
      compTables,
      compEdges,
      rank,
      relations.tableDims
    )

    minimizeLayerCrossings(layers, segmentsByLayer, meta, relations.tableEnumIds)

    const placed = assignComponentPositions(
      layers,
      segmentsByLayer,
      meta,
      relations.hasExternalFk,
      cursorY,
      tablePositions
    )
    maxRightEdgeWithGap = Math.max(maxRightEdgeWithGap, placed.rightmostEdgeWithGap)
    cursorY = snapCeil(placed.maxBottomY + COMPONENT_GAP)
  }

  if (standalone.length > 0) {
    const preferGrid = relational.length > 0 || standalone.length >= 4
    const placedStandalone = placeStandaloneTables(
      standalone,
      relations,
      cursorY,
      preferGrid,
      tablePositions
    )
    maxRightEdgeWithGap = Math.max(maxRightEdgeWithGap, placedStandalone.rightmostEdgeWithGap)
  }

  const enumX = tables.length === 0 ? ORIGIN_X : snap(maxRightEdgeWithGap)
  placeAlignedEnums(enums, relations, tablePositions, enumX, enumPositions)

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
