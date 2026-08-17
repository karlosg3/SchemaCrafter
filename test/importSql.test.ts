import { describe, expect, it } from 'vitest'
import { mergeImportedSql } from '#shared/utils/importSql'
import { ECOMMERCE_TEMPLATE } from '#shared/utils/templates'

const NEW_TABLE = `
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  action VARCHAR NOT NULL,
  created_at TIMESTAMP
);
`

const EXISTING_TABLE = `
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  nickname VARCHAR
);
`

describe('mergeImportedSql', () => {
  it('adds a new table without dropping the ones already there', () => {
    const before = ECOMMERCE_TEMPLATE.tables.map(t => t.name)
    const { project, added, updated } = mergeImportedSql(ECOMMERCE_TEMPLATE, NEW_TABLE)

    expect(added).toEqual(['audit_log'])
    expect(updated).toEqual([])
    // The parser alone returns only what the DDL mentioned; the merge is what
    // keeps an import from wiping the rest of the database (PAR-10).
    expect(project.tables.map(t => t.name).sort()).toEqual([...before, 'audit_log'].sort())
  })

  it('refreshes a table that already exists, keeping its id', () => {
    const original = ECOMMERCE_TEMPLATE.tables.find(t => t.name === 'users')!
    const { project, added, updated } = mergeImportedSql(ECOMMERCE_TEMPLATE, EXISTING_TABLE)

    expect(added).toEqual([])
    expect(updated).toEqual(['users'])

    const users = project.tables.find(t => t.name === 'users')!
    // Reusing the id is what keeps orders.user_id pointing at this table.
    expect(users.id).toBe(original.id)
    expect(users.columns.map(c => c.name)).toEqual(['id', 'email', 'nickname'])
    expect(project.tables).toHaveLength(ECOMMERCE_TEMPLATE.tables.length)
  })

  it('leaves the project alone when the DDL has no CREATE TABLE', () => {
    const { project, added, updated } = mergeImportedSql(ECOMMERCE_TEMPLATE, '-- nothing here')

    expect(added).toEqual([])
    expect(updated).toEqual([])
    expect(project.tables.map(t => t.name)).toEqual(ECOMMERCE_TEMPLATE.tables.map(t => t.name))
  })

  it('picks up a CREATE SCHEMA alongside the tables', () => {
    const { project } = mergeImportedSql(
      ECOMMERCE_TEMPLATE,
      `CREATE SCHEMA reporting;\nCREATE TABLE reporting.daily (id INT PRIMARY KEY);`
    )

    expect(project.schemas.map(s => s.name)).toContain('reporting')
  })

  it('does not mutate the project it was given', () => {
    const snapshot = JSON.stringify(ECOMMERCE_TEMPLATE)
    mergeImportedSql(ECOMMERCE_TEMPLATE, NEW_TABLE)
    expect(JSON.stringify(ECOMMERCE_TEMPLATE)).toBe(snapshot)
  })
})
