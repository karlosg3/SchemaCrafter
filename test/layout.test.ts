import { describe, expect, it } from 'vitest'
import { alignNodes, computeDagSchemaLayout } from '#shared/utils/layout'
import { BLOCK } from '#shared/utils/graph'
import { PROJECT_TEMPLATES } from '#shared/utils/templates'

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

describe('computeDagSchemaLayout - relationship optimization', () => {
  it('pulls short leaf FK tables next to their parent column instead of stranding at column 0', () => {
    const res = computeDagSchemaLayout([
      { id: 'payments', name: 'payments', columns: [{ foreignKey: { targetTableId: 'invoices' } }] },
      { id: 'invoices', name: 'invoices', columns: [{ foreignKey: { targetTableId: 'subscriptions' } }] },
      { id: 'subscriptions', name: 'subscriptions', columns: [{ foreignKey: { targetTableId: 'users' } }] },
      { id: 'api_keys', name: 'api_keys', columns: [{ foreignKey: { targetTableId: 'users' } }] },
      { id: 'users', name: 'users', columns: [] }
    ])

    // Deep chain occupies 4 layers; api_keys has only 1 FK to users so it belongs adjacent to users
    expect(res.tablePositions.payments!.x).toBeLessThan(res.tablePositions.invoices!.x)
    expect(res.tablePositions.invoices!.x).toBeLessThan(res.tablePositions.subscriptions!.x)
    expect(res.tablePositions.subscriptions!.x).toBeLessThan(res.tablePositions.users!.x)
    expect(res.tablePositions.api_keys!.x).toBe(res.tablePositions.subscriptions!.x)
  })

  it('orders targets according to outgoing column port order to prevent handle crossings', () => {
    const res = computeDagSchemaLayout([
      {
        id: 'hub',
        name: 'hub',
        columns: [
          { id: 'c0', foreignKey: { targetTableId: 'z_top' } },
          { id: 'c1' },
          { id: 'c2' },
          { id: 'c3', foreignKey: { targetTableId: 'a_bottom' } }
        ]
      },
      { id: 'z_top', name: 'z_top', columns: [{ id: 'id' }] },
      { id: 'a_bottom', name: 'a_bottom', columns: [{ id: 'id' }] }
    ])

    // Alphabetically a_bottom < z_top, but hub connects row 0 -> z_top and row 3 -> a_bottom
    expect(res.tablePositions.z_top!.y).toBeLessThan(res.tablePositions.a_bottom!.y)
  })

  it('eliminates planar layer crossings despite adversarial alphabetical names', () => {
    const res = computeDagSchemaLayout([
      { id: 'a_left', name: 'a_left', columns: [{ foreignKey: { targetTableId: 'z_parent' } }] },
      { id: 'z_left', name: 'z_left', columns: [{ foreignKey: { targetTableId: 'a_parent' } }] },
      { id: 'a_parent', name: 'a_parent', columns: [] },
      { id: 'z_parent', name: 'z_parent', columns: [] }
    ])

    const aL = res.tablePositions.a_left!.y
    const zL = res.tablePositions.z_left!.y
    const aP = res.tablePositions.a_parent!.y
    const zP = res.tablePositions.z_parent!.y

    // Edges (a_left -> z_parent) and (z_left -> a_parent) must stay parallel, never crossing
    expect((aL - zL) * (zP - aP)).toBeGreaterThan(0)
  })

  it('vertically centers a parent hub between multiple stacked child tables', () => {
    const res = computeDagSchemaLayout([
      { id: 'c1', name: 'c1', columns: [{ foreignKey: { targetTableId: 'users' } }] },
      { id: 'c2', name: 'c2', columns: [{ foreignKey: { targetTableId: 'users' } }] },
      { id: 'c3', name: 'c3', columns: [{ foreignKey: { targetTableId: 'users' } }] },
      { id: 'users', name: 'users', columns: [{ id: 'u_id' }] }
    ])

    const ys = [res.tablePositions.c1!.y, res.tablePositions.c2!.y, res.tablePositions.c3!.y]
      .sort((a, b) => a - b)
    const usersY = res.tablePositions.users!.y

    expect(usersY).toBeGreaterThan(ys[0]!)
    expect(usersY).toBeLessThan(ys[2]!)
  })

  it('orders enums to align with referencing table heights rather than alphabetically', () => {
    const res = computeDagSchemaLayout(
      [
        {
          id: 'orders',
          name: 'orders',
          columns: [
            { id: 'o1', foreignKey: { targetTableId: 'anchor' } },
            { id: 'o2', type: 'ENUM', enumName: 'Z_Status' }
          ]
        },
        {
          id: 'invoices',
          name: 'invoices',
          columns: [
            { id: 'i1', foreignKey: { targetTableId: 'anchor' } },
            { id: 'i2', type: 'ENUM', enumName: 'A_Tier' }
          ]
        },
        {
          id: 'anchor',
          name: 'anchor',
          columns: [
            { id: 'id1' },
            { id: 'id2' }
          ]
        },
        {
          id: 'top_seed',
          name: 'top_seed',
          columns: [
            { id: 's1', foreignKey: { targetTableId: 'orders' } },
            { id: 's2' }
          ]
        }
      ],
      [
        { id: 'enum_a', name: 'A_Tier', valuesCount: 3 },
        { id: 'enum_z', name: 'Z_Status', valuesCount: 3 }
      ]
    )

    const ordersY = res.tablePositions.orders!.y
    const invoicesY = res.tablePositions.invoices!.y
    const enumZY = res.enumPositions.enum_z!.y
    const enumAY = res.enumPositions.enum_a!.y

    // Vertical order of enums must track their referencing tables so wires stay uncrossed
    expect((ordersY - invoicesY) * (enumZY - enumAY)).toBeGreaterThan(0)
  })

  it('keeps high-in-degree hubs on the right when breaking cycles regardless of names', () => {
    // a_hub is alphabetically first AND has a cycle edge back to z_child, yet 3 other children point to a_hub
    const res = computeDagSchemaLayout([
      { id: 'a_hub', name: 'a_hub', columns: [{ foreignKey: { targetTableId: 'z_child' } }] },
      { id: 'z_child', name: 'z_child', columns: [{ foreignKey: { targetTableId: 'a_hub' } }] },
      { id: 'k1', name: 'k1', columns: [{ foreignKey: { targetTableId: 'a_hub' } }] },
      { id: 'k2', name: 'k2', columns: [{ foreignKey: { targetTableId: 'a_hub' } }] },
      { id: 'k3', name: 'k3', columns: [{ foreignKey: { targetTableId: 'a_hub' } }] }
    ])

    expect(res.tablePositions.z_child!.x).toBeLessThan(res.tablePositions.a_hub!.x)
  })

  it('separates disconnected components into distinct vertical bands and clears cross-schema stubs', () => {
    const res = computeDagSchemaLayout(
      [
        { id: 'orders', name: 'orders', columns: [{ foreignKey: { targetTableId: 'users' } }] },
        { id: 'users', name: 'users', columns: [{ foreignKey: { targetTableId: 'external_auth_users' } }] },
        { id: 'posts', name: 'posts', columns: [{ foreignKey: { targetTableId: 'categories' } }] },
        { id: 'categories', name: 'categories', columns: [] },
        { id: 'settings', name: 'settings', columns: [] }
      ],
      [{ id: 'e1', name: 'Status', valuesCount: 2 }]
    )

    // Users has a cross-schema FK stub extending ~200px to the right -> enum column must clear >= 240px
    const usersRight = res.tablePositions.users!.x + BLOCK.width
    expect(res.enumPositions.e1!.x - usersRight).toBeGreaterThanOrEqual(240)

    // Disconnected clusters + isolated settings table occupy non-overlapping Y bands
    const comp1YMax = Math.max(res.tablePositions.orders!.y, res.tablePositions.users!.y)
    const comp2YMin = Math.min(res.tablePositions.posts!.y, res.tablePositions.categories!.y)
    const comp2YMax = Math.max(res.tablePositions.posts!.y, res.tablePositions.categories!.y)
    expect(comp2YMin).toBeGreaterThan(comp1YMax)
    expect(res.tablePositions.settings!.y).toBeGreaterThan(comp2YMax)
  })

  it('lays out every built-in project template cleanly on the 16px grid with zero overlaps', () => {
    for (const template of PROJECT_TEMPLATES) {
      const { project } = template
      const res = computeDagSchemaLayout(
        project.tables,
        project.enums.map(e => ({ id: e.id, name: e.name, valuesCount: e.values.length }))
      )

      interface Rect { id: string, x: number, y: number, w: number, h: number }
      const rects: Rect[] = []

      for (const t of project.tables) {
        const pos = res.tablePositions[t.id]!
        expect(pos).toBeDefined()
        expect(pos.x % 16).toBe(0)
        expect(pos.y % 16).toBe(0)
        const h = BLOCK.headerHeight + t.columns.length * BLOCK.rowHeight + BLOCK.footerHeight + BLOCK.borderWidth * 2
        rects.push({ id: t.id, x: pos.x, y: pos.y, w: BLOCK.width, h })
      }

      for (const e of project.enums) {
        const pos = res.enumPositions[e.id]!
        expect(pos).toBeDefined()
        expect(pos.x % 16).toBe(0)
        expect(pos.y % 16).toBe(0)
        const h = BLOCK.headerHeight + e.values.length * BLOCK.rowHeightEnum + BLOCK.footerHeight + BLOCK.borderWidth * 2
        rects.push({ id: e.id, x: pos.x, y: pos.y, w: BLOCK.widthEnum, h })
      }

      for (let i = 0; i < rects.length; i++) {
        const a = rects[i]!
        for (let j = i + 1; j < rects.length; j++) {
          const b = rects[j]!
          const overlapX = a.x < b.x + b.w && a.x + a.w > b.x
          const overlapY = a.y < b.y + b.h && a.y + a.h > b.y
          expect(overlapX && overlapY, `Overlap in ${project.name} between ${a.id} and ${b.id}`).toBe(false)
        }
      }
    }
  })
})
