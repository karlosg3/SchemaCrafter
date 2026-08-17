// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from '~/stores/workspace'
import { TEMPLATES } from './fixtures'
import { migrateV1ToWorkspace } from '#shared/utils/migrations'

function storeWithTemplates() {
  const store = useWorkspaceStore()
  store.replaceWorkspace(migrateV1ToWorkspace(TEMPLATES.map(([, p]) => p)))
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('databases', () => {
  it('creates a database with a public schema already in it', () => {
    const store = useWorkspaceStore()
    const db = store.createDatabase('Shop', 'mysql')

    expect(db.engine).toBe('mysql')
    expect(store.schemasOfDatabase(db.id).map(s => s.name)).toEqual(['public'])
  })

  it('updates the database it is given, not the first one (APP-1)', () => {
    const store = storeWithTemplates()
    const [first, second] = store.databases

    store.updateDatabase(second!.id, { name: 'Renamed', engine: 'sqlite' })

    expect(store.database(second!.id)!.name).toBe('Renamed')
    expect(store.database(second!.id)!.engine).toBe('sqlite')
    // The other database is untouched.
    expect(store.database(first!.id)!.name).toBe('E-Commerce Platform')
    expect(store.database(first!.id)!.engine).toBe('postgresql')
  })

  it('deleting a database takes its schemas, tables and enums with it', () => {
    const store = storeWithTemplates()
    const [first, second] = store.databases
    const doomed = store.tablesOfDatabase(first!.id).map(t => t.id)

    store.deleteDatabase(first!.id)

    expect(store.databases.map(d => d.id)).toEqual([second!.id])
    for (const id of doomed) expect(store.table(id)).toBeUndefined()
    // The survivor is intact.
    expect(store.tablesOfDatabase(second!.id)).toHaveLength(3)
  })
})

describe('schemas', () => {
  it('re-parents tables to public instead of orphaning them', () => {
    const store = storeWithTemplates()
    const db = store.databases[0]!
    const authTables = store.tablesOfSchema('schema-auth').map(t => t.id)

    store.deleteSchema('schema-auth')

    expect(store.schema('schema-auth')).toBeUndefined()
    for (const id of authTables) {
      const t = store.table(id)!
      expect(t).toBeDefined()
      expect(store.schema(t.schemaId)).toBeDefined()
      expect(store.schema(t.schemaId)!.dbId).toBe(db.id)
    }
  })

  it('de-duplicates schema names within a database', () => {
    const store = storeWithTemplates()
    const db = store.databases[0]!

    const created = store.createSchema(db.id, 'auth')
    expect(created!.name).toBe('auth_2')
  })
})

describe('columns', () => {
  it('clears inbound foreign keys when a column is deleted (REL-8)', () => {
    const store = storeWithTemplates()

    const before = store.table('table-orders')!.columns.find(c => c.name === 'user_id')!
    expect(before.foreignKey).toBeDefined()

    store.deleteColumn('table-users', 'u-1')

    const after = store.table('table-orders')!.columns.find(c => c.name === 'user_id')!
    expect(after.foreignKey).toBeUndefined()
  })

  it('clears inbound foreign keys when a table is deleted', () => {
    const store = storeWithTemplates()
    store.deleteTable('table-users')

    const userId = store.table('table-orders')!.columns.find(c => c.name === 'user_id')!
    expect(userId.foreignKey).toBeUndefined()
  })

  it('de-duplicates column names within a table', () => {
    const store = storeWithTemplates()
    const added = store.addColumn('table-users', { name: 'email' })
    expect(added!.name).toBe('email_2')
  })
})

describe('relationships', () => {
  it('rejects a relation between mismatched types', () => {
    const store = storeWithTemplates()
    // orders.total_amount is DECIMAL, users.id is UUID.
    expect(store.canRelate('table-orders', 'o-3', 'table-users', 'u-1')).toBe(false)
    expect(store.relate('table-orders', 'o-3', 'table-users', 'u-1')).toBe(false)
  })

  it('rejects a relation whose target is neither primary nor unique', () => {
    const store = storeWithTemplates()
    // products.title is a plain VARCHAR.
    expect(store.canRelate('table-users', 'u-2', 'table-products', 'p-2')).toBe(false)
  })

  it('accepts a matching type against a primary key', () => {
    const store = storeWithTemplates()
    expect(store.relate('table-order-items', 'oi-2', 'table-users', 'u-1', { onDelete: 'CASCADE' })).toBe(true)

    const col = store.table('table-order-items')!.columns.find(c => c.id === 'oi-2')!
    expect(col.foreignKey).toEqual({
      targetTableId: 'table-users',
      targetColumnId: 'u-1',
      onDelete: 'CASCADE'
    })
  })

  it('rejects a column relating to itself', () => {
    const store = storeWithTemplates()
    expect(store.canRelate('table-users', 'u-1', 'table-users', 'u-1')).toBe(false)
  })
})

describe('enums', () => {
  it('renames referencing columns along with the enum', () => {
    const store = storeWithTemplates()

    store.updateEnum('enum-order-status', { name: 'OrderState' })

    const status = store.table('table-orders')!.columns.find(c => c.name === 'status')!
    expect(status.enumName).toBe('OrderState')
  })
})

describe('geometry', () => {
  it('persists positions for every node kind, not just tables (APP-2)', () => {
    const store = storeWithTemplates()

    store.moveNode('table', 'table-users', { x: 11, y: 22 })
    store.moveNode('schema', 'schema-auth', { x: 33, y: 44 })
    store.moveNode('enum', 'enum-order-status', { x: 55, y: 66 })

    expect(store.table('table-users')!.position).toEqual({ x: 11, y: 22 })
    expect(store.schema('schema-auth')!.position).toEqual({ x: 33, y: 44 })
    expect(store.enumEntity('enum-order-status')!.position).toEqual({ x: 55, y: 66 })
  })

  it('persists node sizes (APP-3)', () => {
    const store = storeWithTemplates()
    store.resizeNode('table', 'table-users', { width: 320, height: 240 })
    expect(store.table('table-users')!.size).toEqual({ width: 320, height: 240 })
  })
})

describe('persistence', () => {
  it('hydrates from the templates when storage is empty', () => {
    const store = useWorkspaceStore()
    store.hydrate()

    expect(store.loadSource).toBe('seeded')
    expect(store.databases).toHaveLength(2)
  })

  it('migrates a v1 payload and writes v2 back', () => {
    localStorage.setItem(
      'schemacrafter_database_projects_v1',
      JSON.stringify(TEMPLATES.map(([, p]) => p))
    )

    const store = useWorkspaceStore()
    store.hydrate()

    expect(store.loadSource).toBe('migrated-v1')
    expect(store.table('table-users')!.position).toEqual({ x: 50, y: 100 })
    expect(localStorage.getItem('schemacrafter_workspace_v2')).toBeTruthy()
    // v1 is left in place as a rollback path.
    expect(localStorage.getItem('schemacrafter_database_projects_v1')).toBeTruthy()
  })

  it('falls back to the templates with a warning on a malformed payload', () => {
    localStorage.setItem('schemacrafter_workspace_v2', '{"formatVersion":99}')

    const store = useWorkspaceStore()
    store.hydrate()

    expect(store.loadSource).toBe('seeded')
    expect(store.loadWarning).toMatch(/malformed/i)
  })

  it('flush writes the current workspace synchronously', () => {
    const store = useWorkspaceStore()
    store.hydrate()
    store.createDatabase('Extra')
    store.flush()

    const raw = JSON.parse(localStorage.getItem('schemacrafter_workspace_v2')!)
    expect(raw.databases.map((d: { name: string }) => d.name)).toContain('Extra')
  })
})
