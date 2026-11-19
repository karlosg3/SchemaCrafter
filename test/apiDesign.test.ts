import { describe, expect, it } from 'vitest'
import {
  buildCrudEndpointPresets,
  buildModulesGraph,
  computeModulesLayout,
  inferTableFromEndpointPath,
  normalizeBasePath,
  normalizeEndpointPath,
  resolveFullEndpointPath,
  splitPathSegments
} from '#shared/utils/apiDesign'
import { isValidWorkspace, reconcileWorkspace } from '#shared/utils/migrations'
import { emptyWorkspace } from '#shared/types/workspace'
import type { Workspace } from '#shared/types/workspace'

function makeSampleWorkspace(): Workspace {
  return {
    formatVersion: 2,
    databases: [
      {
        id: 'db-1',
        name: 'App',
        engine: 'postgresql',
        gradient: ['#6366f1', '#8b5cf6'],
        schemaIds: ['schema-1'],
        moduleIds: ['mod-users']
      }
    ],
    schemas: {
      'schema-1': {
        id: 'schema-1',
        dbId: 'db-1',
        name: 'public',
        gradient: ['#64748b', '#475569'],
        tableIds: ['tbl-users', 'tbl-orders'],
        enumIds: []
      }
    },
    tables: {
      'tbl-users': {
        id: 'tbl-users',
        schemaId: 'schema-1',
        name: 'users',
        gradient: ['#6366f1', '#8b5cf6'],
        position: { x: 80, y: 80 },
        columns: [
          { id: 'c-u-id', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true }
        ]
      },
      'tbl-orders': {
        id: 'tbl-orders',
        schemaId: 'schema-1',
        name: 'orders',
        gradient: ['#22c55e', '#16a34a'],
        position: { x: 480, y: 80 },
        columns: [
          { id: 'c-o-id', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true }
        ]
      }
    },
    enums: {},
    modules: {
      'mod-users': {
        id: 'mod-users',
        dbId: 'db-1',
        name: 'Users',
        basePath: '/users',
        gradient: ['#6366f1', '#8b5cf6'],
        tableIds: ['tbl-users'],
        endpointIds: ['ep-list']
      }
    },
    endpoints: {
      'ep-list': {
        id: 'ep-list',
        moduleId: 'mod-users',
        method: 'GET',
        path: '/users',
        description: 'List users',
        tableIds: ['tbl-users']
      }
    }
  }
}

describe('apiDesign path helpers', () => {
  it('normalizes paths and joins module basePath without duplicating prefixes', () => {
    expect(normalizeEndpointPath('users//')).toBe('/users')
    expect(normalizeEndpointPath('/')).toBe('/')
    expect(normalizeBasePath('  /api/v1/ ')).toBe('/api/v1')
    expect(normalizeBasePath('/')).toBe('')

    expect(resolveFullEndpointPath('/users', '/users/:id')).toBe('/users/:id')
    expect(resolveFullEndpointPath('/users', '/:id')).toBe('/users/:id')
    expect(resolveFullEndpointPath('/api/v1', '/orders')).toBe('/api/v1/orders')
  })

  it('splits route segments highlighting :param and {param} tokens', () => {
    expect(splitPathSegments('/users/:id/orders/{orderId}')).toEqual([
      { text: '/', isParam: false },
      { text: 'users', isParam: false },
      { text: '/', isParam: false },
      { text: ':id', isParam: true },
      { text: '/', isParam: false },
      { text: 'orders', isParam: false },
      { text: '/', isParam: false },
      { text: '{orderId}', isParam: true }
    ])
  })

  it('builds standard CRUD REST presets from a table name', () => {
    const presets = buildCrudEndpointPresets('order_items')
    expect(presets.map(p => `${p.method} ${p.path}`)).toEqual([
      'GET /order-items',
      'GET /order-items/:id',
      'POST /order-items',
      'PATCH /order-items/:id',
      'PUT /order-items/:id',
      'DELETE /order-items/:id'
    ])
    expect(presets.find(p => p.method === 'PUT')?.selectedByDefault).toBe(false)
    expect(presets.find(p => p.method === 'GET' && p.path === '/order-items')?.selectedByDefault).toBe(true)
  })
})

describe('inferTableFromEndpointPath', () => {
  it('extracts snake_case resource names skipping api/version prefixes and params', () => {
    expect(inferTableFromEndpointPath('/api/v1/blog-posts/:postId')).toEqual({
      tableName: 'blog_posts',
      parentFk: null
    })
  })

  it('detects matching parent table on nested routes and suggests a foreign key', () => {
    const ws = makeSampleWorkspace()
    const tables = Object.values(ws.tables)
    const proposal = inferTableFromEndpointPath('/api/v1/users/:userId/sessions', tables)

    expect(proposal.tableName).toBe('sessions')
    expect(proposal.parentFk).toEqual({
      columnName: 'user_id',
      targetTableId: 'tbl-users',
      targetTableName: 'users',
      targetColumnId: 'c-u-id',
      targetColumnName: 'id'
    })
  })
})

describe('workspace module/endpoint validation and reconciliation', () => {
  it('accepts legacy v2 workspaces without modules or endpoints', () => {
    const ws = emptyWorkspace()
    const legacy = {
      formatVersion: ws.formatVersion,
      databases: ws.databases,
      schemas: ws.schemas,
      tables: ws.tables,
      enums: ws.enums
    }
    expect(isValidWorkspace(legacy)).toBe(true)
    const reconciled = reconcileWorkspace(legacy)
    expect(reconciled.modules).toEqual({})
    expect(reconciled.endpoints).toEqual({})
  })

  it('prunes deleted tables without dropping endpoints and syncs endpoint tables into parent module', () => {
    const ws = makeSampleWorkspace()
    ws.endpoints!['ep-list']!.tableIds = ['tbl-orders', 'tbl-missing']
    ws.modules!['mod-users']!.tableIds = ['tbl-missing']

    expect(isValidWorkspace(ws)).toBe(true)
    const reconciled = reconcileWorkspace(ws)

    expect(reconciled.endpoints!['ep-list']!.tableIds).toEqual(['tbl-orders'])
    expect(reconciled.modules!['mod-users']!.tableIds).toEqual(['tbl-orders'])
  })

  it('rejects endpoints with invalid HTTP methods', () => {
    const ws = makeSampleWorkspace()
    const bad = structuredClone(ws) as unknown as Record<string, unknown>
    ;(bad.endpoints as Record<string, Record<string, unknown>>)['ep-list']!.method = 'BREW'
    expect(isValidWorkspace(bad)).toBe(false)
  })
})

describe('buildModulesGraph and computeModulesLayout', () => {
  it('builds module and entityRef nodes with edges and respects showUnlinkedTables', () => {
    const ws = makeSampleWorkspace()

    const linkedOnly = buildModulesGraph(ws, 'db-1', { showUnlinkedTables: false, editable: true })
    expect(linkedOnly.nodes.map(n => n.id)).toEqual(['mod-users', 'entity:tbl-users'])
    expect(linkedOnly.edges).toHaveLength(1)
    expect(linkedOnly.edges[0]!.data.label).toBe('1 endpoint')

    const withUnlinked = buildModulesGraph(ws, 'db-1', { showUnlinkedTables: true, editable: true })
    expect(withUnlinked.nodes.map(n => n.id)).toEqual(['mod-users', 'entity:tbl-users', 'entity:tbl-orders'])
  })

  it('aligns layout coordinates on the 16px grid without overlaps', () => {
    const ws = makeSampleWorkspace()
    const layout = computeModulesLayout(Object.values(ws.modules!), Object.values(ws.tables))

    for (const pos of [...Object.values(layout.modulePositions), ...Object.values(layout.entityPositions)]) {
      expect(pos.x % 16).toBe(0)
      expect(pos.y % 16).toBe(0)
    }
    expect(layout.entityPositions['tbl-users']!.x).toBeGreaterThan(layout.modulePositions['mod-users']!.x)
    expect(layout.entityPositions['tbl-orders']!.y).toBeGreaterThan(layout.entityPositions['tbl-users']!.y)
  })
})
