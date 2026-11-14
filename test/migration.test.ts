import { describe, expect, it } from 'vitest'
import type { DatabaseProject } from '#shared/types/schema'
import { WORKSPACE_FORMAT_VERSION } from '#shared/types/workspace'
import {
  isValidV1Payload,
  isValidWorkspace,
  migrateV1ToWorkspace,
  reconcileWorkspace
} from '#shared/utils/migrations'
import { toDatabaseProject } from '#shared/utils/projection'
import { TEMPLATES, normalize } from './fixtures'

describe('migrateV1ToWorkspace', () => {
  it('stamps the format version inside the payload (ENG-8)', () => {
    const ws = migrateV1ToWorkspace([TEMPLATES[0]![1]])
    expect(ws.formatVersion).toBe(WORKSPACE_FORMAT_VERSION)
  })

  it('carries positions, colours and foreign keys through intact', () => {
    const [, ecommerce] = TEMPLATES[0]!
    const ws = migrateV1ToWorkspace([ecommerce])

    const users = ws.tables['table-users']!
    expect(users.position).toEqual({ x: 50, y: 100 })
    expect(users.gradient[0]).toBe('#6366f1')

    const orders = ws.tables['table-orders']!
    const userId = orders.columns.find(c => c.name === 'user_id')!
    expect(userId.foreignKey).toEqual({
      targetTableId: 'table-users',
      targetColumnId: 'u-1',
      onDelete: 'CASCADE'
    })
  })

  it('maps a known palette colour to its gradient and keeps unknown ones', () => {
    const ws = migrateV1ToWorkspace([TEMPLATES[0]![1]])
    // #6366f1 is the prototype indigo gradient's `from`.
    expect(ws.schemas['schema-auth']!.gradient).toEqual(['#6366f1', '#8b5cf6'])
    // #10b981 is not in the palette, so it is preserved rather than snapped.
    expect(ws.schemas['schema-catalog']!.gradient).toEqual(['#10b981', '#10b981'])
  })

  it('re-parents orphaned tables into a public schema', () => {
    const orphaned: DatabaseProject = {
      id: 'db-1',
      name: 'Orphans',
      engine: 'postgresql',
      schemas: [],
      enums: [],
      tables: [{
        id: 't1',
        name: 'floating',
        position: { x: 0, y: 0 },
        columns: [{ id: 'c1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true }]
      }]
    }

    const ws = migrateV1ToWorkspace([orphaned])
    const schema = Object.values(ws.schemas)[0]!

    expect(schema.name).toBe('public')
    expect(ws.tables.t1!.schemaId).toBe(schema.id)
    expect(schema.tableIds).toEqual(['t1'])
  })

  it('keeps two databases separate', () => {
    const [, ecommerce] = TEMPLATES[0]!
    const [, saas] = TEMPLATES[1]!
    const ws = migrateV1ToWorkspace([ecommerce, saas])

    expect(ws.databases.map(d => d.id)).toEqual([ecommerce.id, saas.id])
    expect(normalize(toDatabaseProject(ws, saas.id))).toEqual(normalize(saas))
  })

  it('handles an empty project list', () => {
    const ws = migrateV1ToWorkspace([])
    expect(ws.databases).toEqual([])
    expect(isValidWorkspace(ws)).toBe(true)
  })
})

describe('isValidWorkspace', () => {
  it('accepts a freshly migrated workspace', () => {
    expect(isValidWorkspace(migrateV1ToWorkspace([TEMPLATES[0]![1]]))).toBe(true)
  })

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an array (the v1 shape)', []],
    ['a wrong format version', { formatVersion: 1, databases: [], schemas: {}, tables: {}, enums: {} }],
    ['missing records', { formatVersion: 2, databases: [] }],
    ['a malformed table', {
      formatVersion: 2,
      databases: [],
      schemas: {},
      tables: { t1: { id: 't1', schemaId: 's1' } },
      enums: {}
    }],
    ['an unsupported database engine', {
      formatVersion: 2,
      databases: [{ id: 'db-1', name: 'Bad', engine: 'oracle', gradient: ['#000', '#111'], schemaIds: [] }],
      schemas: {},
      tables: {},
      enums: {}
    }],
    ['a column with unknown type', {
      formatVersion: 2,
      databases: [],
      schemas: {},
      tables: {
        t1: {
          id: 't1',
          schemaId: 's1',
          name: 'bad',
          gradient: ['#000', '#111'],
          position: { x: 0, y: 0 },
          columns: [{ id: 'c1', name: 'x', type: 'BLOB', isPrimaryKey: false, isNullable: true, isUnique: false }]
        }
      },
      enums: {}
    }],
    ['an enum with non-array values', {
      formatVersion: 2,
      databases: [],
      schemas: {},
      tables: {},
      enums: { e1: { id: 'e1', schemaId: 's1', name: 'E', values: 'a,b' } }
    }]
  ])('rejects %s', (_label, payload) => {
    expect(isValidWorkspace(payload)).toBe(false)
  })
})

describe('isValidV1Payload', () => {
  it('accepts the v1 template array', () => {
    expect(isValidV1Payload(TEMPLATES.map(([, p]) => p))).toBe(true)
  })

  it.each([
    ['an empty array', []],
    ['a v2 object', { formatVersion: 2 }],
    ['projects without tables', [{ id: 'a', name: 'a' }]]
  ])('rejects %s', (_label, payload) => {
    expect(isValidV1Payload(payload)).toBe(false)
  })
})

describe('reconcileWorkspace', () => {
  it('drops schema references to deleted tables', () => {
    const ws = migrateV1ToWorkspace([TEMPLATES[0]![1]])
    delete ws.tables['table-users']

    const fixed = reconcileWorkspace(ws)
    expect(fixed.schemas['schema-auth']!.tableIds).not.toContain('table-users')
  })

  it('clears foreign keys whose target table is gone (REL-8 class)', () => {
    const ws = migrateV1ToWorkspace([TEMPLATES[0]![1]])
    delete ws.tables['table-users']

    const fixed = reconcileWorkspace(ws)
    const userId = fixed.tables['table-orders']!.columns.find(c => c.name === 'user_id')!

    expect(userId.foreignKey).toBeUndefined()
  })

  it('clears foreign keys whose target column is gone', () => {
    const ws = migrateV1ToWorkspace([TEMPLATES[0]![1]])
    ws.tables['table-users'] = {
      ...ws.tables['table-users']!,
      columns: ws.tables['table-users']!.columns.filter(c => c.id !== 'u-1')
    }

    const fixed = reconcileWorkspace(ws)
    const userId = fixed.tables['table-orders']!.columns.find(c => c.name === 'user_id')!

    expect(userId.foreignKey).toBeUndefined()
  })

  it('is a no-op on a healthy workspace', () => {
    const ws = migrateV1ToWorkspace([TEMPLATES[0]![1], TEMPLATES[1]![1]])
    expect(reconcileWorkspace(ws)).toEqual(ws)
  })
})
