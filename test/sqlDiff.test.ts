import { describe, expect, it } from 'vitest'
import type { DatabaseProject } from '#shared/types/schema'
import { diffProjectToAlterSql } from '#shared/utils/sqlDiff'

function baseProject(): DatabaseProject {
  return {
    id: 'db-1',
    name: 'App',
    engine: 'postgresql',
    schemas: [{ id: 's-1', name: 'public', color: '#6366f1' }],
    enums: [],
    tables: [
      {
        id: 't-users',
        name: 'users',
        schemaId: 's-1',
        position: { x: 0, y: 0 },
        columns: [
          { id: 'c-id', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
          { id: 'c-email', name: 'email', type: 'VARCHAR', length: 120, isPrimaryKey: false, isNullable: false, isUnique: true },
          { id: 'c-bio', name: 'bio', type: 'TEXT', isPrimaryKey: false, isNullable: true, isUnique: false }
        ]
      },
      {
        id: 't-logs',
        name: 'legacy_logs',
        schemaId: 's-1',
        position: { x: 200, y: 0 },
        columns: [
          { id: 'c-lid', name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false, isUnique: true }
        ]
      }
    ]
  }
}

describe('diffProjectToAlterSql', () => {
  it('returns no statements when schemas match', () => {
    const p = baseProject()
    const diff = diffProjectToAlterSql(p, p)
    expect(diff.statements).toEqual([])
    expect(diff.sql).toBe('-- No schema changes detected.')
  })

  it('emits CREATE TABLE, DROP TABLE, ADD/DROP/ALTER COLUMN and CREATE INDEX', () => {
    const before = baseProject()
    const after: DatabaseProject = {
      ...baseProject(),
      enums: [{ id: 'e-role', name: 'Role', values: ['user', 'admin'] }],
      tables: [
        {
          id: 't-users',
          name: 'users',
          schemaId: 's-1',
          position: { x: 0, y: 0 },
          indexes: [{ id: 'i-1', name: 'idx_users_email_role', columnNames: ['email', 'role'], isUnique: false }],
          columns: [
            { id: 'c-id', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
            { id: 'c-email', name: 'email', type: 'VARCHAR', length: 255, isPrimaryKey: false, isNullable: true, isUnique: true },
            { id: 'c-role', name: 'role', type: 'VARCHAR', length: 32, isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'user' }
          ]
        },
        {
          id: 't-orders',
          name: 'orders',
          schemaId: 's-1',
          position: { x: 300, y: 0 },
          columns: [
            { id: 'c-oid', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true }
          ]
        }
      ]
    }

    const diff = diffProjectToAlterSql(before, after)
    expect(diff.summary).toEqual({
      tablesAdded: 1,
      tablesDropped: 1,
      tablesRenamed: 0,
      columnsAdded: 1,
      columnsDropped: 1,
      columnsAltered: 1
    })
    expect(diff.sql).toContain('CREATE TYPE "role" AS ENUM (\'user\', \'admin\');')
    expect(diff.sql).toContain('DROP TABLE IF EXISTS "legacy_logs";')
    expect(diff.sql).toContain('CREATE TABLE "orders"')
    expect(diff.sql).toContain('ALTER TABLE "users" DROP COLUMN "bio";')
    expect(diff.sql).toContain('ALTER TABLE "users" ADD COLUMN "role" VARCHAR(32) NOT NULL DEFAULT \'user\';')
    expect(diff.sql).toContain('ALTER TABLE "users" ALTER COLUMN "email" TYPE VARCHAR(255);')
    expect(diff.sql).toContain('ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;')
    expect(diff.sql).toContain('CREATE INDEX "idx_users_email_role" ON "users" ("email", "role");')
  })
})
