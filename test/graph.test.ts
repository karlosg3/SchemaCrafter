import { describe, expect, it } from 'vitest'
import type { Workspace } from '#shared/types/workspace'
import type { GraphOptions } from '#shared/utils/graph'
import {
  BLOCK,
  blockHeight,
  buildGraph,
  columnIdFromHandle,
  rowSourceHandle,
  rowTargetHandle
} from '#shared/utils/graph'
import { migrateV1ToWorkspace } from '#shared/utils/migrations'
import { ECOMMERCE_TEMPLATE } from '#shared/utils/templates'

const ws: Workspace = migrateV1ToWorkspace([ECOMMERCE_TEMPLATE])
const dbId = ws.databases[0]!.id

function schemaIdNamed(name: string): string {
  const found = Object.values(ws.schemas).find(s => s.name === name)
  if (!found) throw new Error(`no schema named ${name}`)
  return found.id
}

function tableIdNamed(name: string): string {
  const found = Object.values(ws.tables).find(t => t.name === name)
  if (!found) throw new Error(`no table named ${name}`)
  return found.id
}

function columnIdNamed(tableName: string, columnName: string): string {
  const table = ws.tables[tableIdNamed(tableName)]!
  const col = table.columns.find(c => c.name === columnName)
  if (!col) throw new Error(`no column ${tableName}.${columnName}`)
  return col.id
}

function options(overrides: Partial<GraphOptions> = {}): GraphOptions {
  return {
    level: 'tables',
    dbId,
    schemaId: null,
    showRelations: true,
    showEnums: true,
    showTypes: true,
    editable: true,
    ...overrides
  }
}

describe('databases level', () => {
  const graph = buildGraph(ws, options({ level: 'databases' }))

  it('renders one block per database, with its schemas as rows', () => {
    expect(graph.nodes).toHaveLength(1)
    const node = graph.nodes[0]!
    expect(node.type).toBe('block')
    if (node.type !== 'block') return

    expect(node.data.kind).toBe('database')
    expect(node.data.rows.map(r => r.label)).toEqual(['auth', 'catalog', 'sales'])
    expect(node.data.rows.map(r => r.sub)).toEqual(['1 table', '2 tables', '2 tables'])
  })

  it('draws no edges — databases are independent', () => {
    expect(graph.edges).toEqual([])
  })

  it('offers deletion only for empty schemas (refactor-plan.md:46)', () => {
    const node = graph.nodes[0]!
    if (node.type !== 'block') throw new Error('expected a block')
    expect(node.data.rows.every(r => r.deletable === false)).toBe(true)
  })
})

describe('schemas level', () => {
  const graph = buildGraph(ws, options({ level: 'schemas' }))

  it('renders one block per schema, with its tables as rows', () => {
    expect(graph.nodes.map(n => n.type === 'block' ? n.data.name : null)).toEqual(['auth', 'catalog', 'sales'])
  })

  it('aggregates only cross-schema foreign keys', () => {
    // sales -> auth (orders.user_id) and sales -> catalog (order_items.product_id).
    // products.category_id stays inside catalog and must not appear.
    expect(graph.edges.map(e => e.data.label).sort()).toEqual(['1 fk', '1 fk'])
    expect(graph.edges).toHaveLength(2)
  })

  it('scales stroke width with the relation count', () => {
    const thick = withExtraCrossKeys(6)
    const widths = buildGraph(thick, options({ level: 'schemas' })).edges.map(e => e.data.width)
    expect(Math.max(...widths)).toBe(4)

    const thicker = withExtraCrossKeys(12)
    const moreWidths = buildGraph(thicker, options({ level: 'schemas' })).edges.map(e => e.data.width)
    expect(Math.max(...moreWidths)).toBe(8)
  })
})

/** Clones the workspace with N extra sales -> auth foreign keys. */
function withExtraCrossKeys(count: number): Workspace {
  const clone: Workspace = structuredClone(ws)
  const orders = Object.values(clone.tables).find(t => t.name === 'orders')!
  const usersId = Object.values(clone.tables).find(t => t.name === 'users')!
  const pk = usersId.columns.find(c => c.isPrimaryKey)!

  for (let i = 0; i < count; i++) {
    orders.columns.push({
      id: `extra-${i}`,
      name: `extra_${i}`,
      type: 'UUID',
      isPrimaryKey: false,
      isNullable: true,
      isUnique: false,
      foreignKey: { targetTableId: usersId.id, targetColumnId: pk.id }
    })
  }
  return clone
}

describe('tables level', () => {
  const salesId = schemaIdNamed('sales')
  const graph = buildGraph(ws, options({ schemaId: salesId }))

  it('renders the schema\'s tables plus its enums', () => {
    const names = graph.nodes.filter(n => n.type === 'block').map(n => n.type === 'block' ? n.data.name : '')
    expect(names).toEqual(['orders', 'order_items', 'OrderStatus'])
  })

  it('gives every column row a connectable handle pair', () => {
    const orders = graph.nodes.find(n => n.type === 'block' && n.data.name === 'orders')!
    if (orders.type !== 'block') throw new Error('expected a block')
    expect(orders.data.rows.every(r => r.connectable)).toBe(true)
    expect(orders.data.rows.find(r => r.label === 'id')?.isPrimaryKey).toBe(true)
  })

  it('links a same-schema foreign key column to column', () => {
    const edge = graph.edges.find(e => e.data.kind === 'fk')
    expect(edge).toBeDefined()
    expect(edge!.source).toBe(tableIdNamed('order_items'))
    expect(edge!.target).toBe(tableIdNamed('orders'))
    expect(edge!.sourceHandle).toBe(rowSourceHandle(columnIdNamed('order_items', 'order_id')))
    expect(edge!.targetHandle).toBe(rowTargetHandle(columnIdNamed('orders', 'id')))
    expect(edge!.data.label).toBe('N : 1')
  })

  it('stubs cross-schema references with a schema.table label', () => {
    const stubs = graph.nodes.filter(n => n.type === 'stub')
    expect(stubs.map(s => s.type === 'stub' ? s.data.label : '').sort())
      .toEqual(['auth.users', 'catalog.products'])
    expect(graph.edges.filter(e => e.data.kind === 'cross')).toHaveLength(2)
  })

  it('links an enum column to its enum block', () => {
    const edge = graph.edges.find(e => e.data.kind === 'enum')
    expect(edge?.data.label).toBe('ENUM')
    expect(edge?.sourceHandle).toBe(rowSourceHandle(columnIdNamed('orders', 'status')))
  })

  it('drops enum blocks and enum edges when showEnums is off', () => {
    const hidden = buildGraph(ws, options({ schemaId: salesId, showEnums: false }))
    expect(hidden.nodes.some(n => n.type === 'block' && n.data.kind === 'enum')).toBe(false)
    expect(hidden.edges.some(e => e.data.kind === 'enum')).toBe(false)
  })

  it('drops every edge when showRelations is off', () => {
    const hidden = buildGraph(ws, options({ schemaId: salesId, showRelations: false }))
    expect(hidden.edges).toEqual([])
    expect(hidden.nodes.some(n => n.type === 'stub')).toBe(false)
  })

  it('drops type badges when showTypes is off', () => {
    const plain = buildGraph(ws, options({ schemaId: salesId, showTypes: false }))
    const orders = plain.nodes.find(n => n.type === 'block' && n.data.name === 'orders')!
    if (orders.type !== 'block') throw new Error('expected a block')
    expect(orders.data.rows.every(r => r.badge === undefined)).toBe(true)
  })

  it('labels an enum column with the enum name rather than "ENUM"', () => {
    const orders = graph.nodes.find(n => n.type === 'block' && n.data.name === 'orders')!
    if (orders.type !== 'block') throw new Error('expected a block')
    expect(orders.data.rows.find(r => r.label === 'status')?.badge).toBe('OrderStatus')
  })

  it('hides the footer and the row tools when editing is off', () => {
    const readOnly = buildGraph(ws, options({ schemaId: salesId, editable: false }))
    const orders = readOnly.nodes.find(n => n.type === 'block' && n.data.name === 'orders')!
    if (orders.type !== 'block') throw new Error('expected a block')
    expect(orders.data.addLabel).toBeUndefined()
    expect(orders.data.deletable).toBe(false)
  })
})

describe('geometry', () => {
  it('measures a block as header + rows + footer + borders', () => {
    expect(blockHeight({ rows: [], rowHeight: BLOCK.rowHeight, addLabel: undefined }))
      .toBe(BLOCK.headerHeight + BLOCK.borderWidth * 2)

    expect(blockHeight({
      rows: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }],
      rowHeight: BLOCK.rowHeight,
      addLabel: 'Add field'
    })).toBe(40 + 2 * 32 + 34 + BLOCK.borderWidth * 2)
  })

  it('keeps positions that were persisted and grids the rest', () => {
    const graph = buildGraph(ws, options({ level: 'databases' }))
    // The migrated database has never been dragged, so it lands on the grid.
    expect(graph.nodes[0]!.position).toEqual({ x: 80, y: 80 })
  })
})

describe('handle ids', () => {
  it('round-trips a column id', () => {
    expect(columnIdFromHandle(rowSourceHandle('col-abc'))).toBe('col-abc')
    expect(columnIdFromHandle(rowTargetHandle('col-abc'))).toBe('col-abc')
  })

  it('rejects block-level handles, which is what blocks enum drops (REL-1)', () => {
    expect(columnIdFromHandle('block-source')).toBeNull()
    expect(columnIdFromHandle('block-target')).toBeNull()
    expect(columnIdFromHandle(null)).toBeNull()
    expect(columnIdFromHandle('nonsense')).toBeNull()
  })
})
