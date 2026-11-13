import { describe, expect, it } from 'vitest'
import { alignNodes, computeDagSchemaLayout } from '#shared/utils/layout'

describe('computeDagSchemaLayout', () => {
  it('places child FK tables to the left of referenced parent tables on 16px grid', () => {
    const result = computeDagSchemaLayout([
      { id: 't-users', name: 'users', columns: [{}] },
      { id: 't-orders', name: 'orders', columns: [{}, { foreignKey: { targetTableId: 't-users' } }] },
      { id: 't-items', name: 'order_items', columns: [{}, { foreignKey: { targetTableId: 't-orders' } }] }
    ], [
      { id: 'e-status', name: 'OrderStatus', valuesCount: 4 }
    ])

    const itemsPos = result.tablePositions['t-items']!
    const ordersPos = result.tablePositions['t-orders']!
    const usersPos = result.tablePositions['t-users']!
    const enumPos = result.enumPositions['e-status']!

    expect(itemsPos.x).toBeLessThan(ordersPos.x)
    expect(ordersPos.x).toBeLessThan(usersPos.x)
    expect(usersPos.x).toBeLessThan(enumPos.x)

    for (const pos of [itemsPos, ordersPos, usersPos, enumPos]) {
      expect(pos.x % 16).toBe(0)
      expect(pos.y % 16).toBe(0)
    }
  })

  it('breaks mutual FK cycles without looping or producing NaN coordinates', () => {
    const result = computeDagSchemaLayout([
      { id: 'a', name: 'a', columns: [{ foreignKey: { targetTableId: 'b' } }] },
      { id: 'b', name: 'b', columns: [{ foreignKey: { targetTableId: 'a' } }] },
      { id: 'c', name: 'c', columns: [{ foreignKey: { targetTableId: 'c' } }] }
    ])

    expect(Object.keys(result.tablePositions)).toHaveLength(3)
    for (const pos of Object.values(result.tablePositions)) {
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    }
  })

  it('stacks sibling tables in the same column without overlapping vertically', () => {
    const result = computeDagSchemaLayout([
      { id: 'u', name: 'users', columns: [{}, {}, {}] },
      { id: 'a', name: 'sessions', columns: [{ foreignKey: { targetTableId: 'u' } }] },
      { id: 'b', name: 'invoices', columns: [{ foreignKey: { targetTableId: 'u' } }] }
    ])

    const a = result.tablePositions['a']!
    const b = result.tablePositions['b']!
    expect(a.x).toBe(b.x)
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(120)
  })
})

describe('alignNodes', () => {
  const sample = [
    { id: '1', x: 100, y: 20, width: 200, height: 100 },
    { id: '2', x: 400, y: 80, width: 100, height: 100 },
    { id: '3', x: 700, y: 140, width: 200, height: 100 }
  ]

  it('aligns left, right, top and bottom edges to bounding extrema', () => {
    expect(alignNodes(sample, 'left')).toEqual({
      1: { x: 100, y: 20 },
      2: { x: 100, y: 80 },
      3: { x: 100, y: 140 }
    })
    expect(alignNodes(sample, 'right')).toEqual({
      1: { x: 700, y: 20 },
      2: { x: 800, y: 80 },
      3: { x: 700, y: 140 }
    })
    expect(alignNodes(sample, 'top')).toEqual({
      1: { x: 100, y: 20 },
      2: { x: 400, y: 20 },
      3: { x: 700, y: 20 }
    })
  })

  it('distributes 3+ nodes evenly along horizontal and vertical axes', () => {
    const h = alignNodes(sample, 'distributeH')
    // Total span 100..900 = 800, widths = 200 + 100 + 200 = 500 -> remaining gap = 150 each
    expect(h['1']!.x).toBe(100)
    expect(h['2']!.x).toBe(450)
    expect(h['3']!.x).toBe(700)

    const v = alignNodes(sample, 'distributeV')
    expect(v['1']!.y).toBe(20)
    expect(v['2']!.y).toBe(80)
    expect(v['3']!.y).toBe(140)
  })
})
