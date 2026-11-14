import { describe, expect, it } from 'vitest'
import type { DatabaseProject } from '#shared/types/schema'
import { generateCodeForTarget } from '#shared/generators/index'
import { parseCodeToProject } from '#shared/parsers/index'
import { mapSqlTypeToDataType } from '#shared/utils/naming'

const EMPTY_PROJECT: DatabaseProject = {
  id: 'db-test',
  name: 'Test DB',
  engine: 'postgresql',
  schemas: [{ id: 'schema-public', name: 'public', color: '#6366f1' }],
  enums: [],
  tables: []
}

describe('Phase 1 parser & generator fixes', () => {
  it('classifies BIGINT, BIGSERIAL and TINYINT(1) before INT in mapSqlTypeToDataType', () => {
    expect(mapSqlTypeToDataType('BIGINT')).toBe('BIGINT')
    expect(mapSqlTypeToDataType('BIGSERIAL')).toBe('BIGINT')
    expect(mapSqlTypeToDataType('INT8')).toBe('BIGINT')
    expect(mapSqlTypeToDataType('TINYINT(1)')).toBe('BOOLEAN')
    expect(mapSqlTypeToDataType('INTEGER')).toBe('INT')
    expect(mapSqlTypeToDataType('SERIAL')).toBe('INT')
  })

  it('emits ON UPDATE and COMMENT ON in SQL generator and onUpdate in MikroORM', () => {
    const project: DatabaseProject = {
      ...EMPTY_PROJECT,
      tables: [
        {
          id: 't-users',
          name: 'users',
          schemaId: 'schema-public',
          position: { x: 0, y: 0 },
          comment: "Users' core account table",
          columns: [
            { id: 'c-1', name: 'id', type: 'BIGINT', isPrimaryKey: true, isNullable: false, isUnique: true, isAutoIncrement: true },
            {
              id: 'c-2',
              name: 'manager_id',
              type: 'BIGINT',
              isPrimaryKey: false,
              isNullable: true,
              isUnique: false,
              comment: 'Direct manager',
              foreignKey: { targetTableId: 't-users', targetColumnId: 'c-1', onDelete: 'SET NULL', onUpdate: 'CASCADE' }
            }
          ]
        }
      ]
    }

    const sql = generateCodeForTarget(project, 'sql')
    expect(sql).toContain('ON DELETE SET NULL ON UPDATE CASCADE')
    expect(sql).toContain(`COMMENT ON TABLE "users" IS 'Users'' core account table';`)
    expect(sql).toContain(`COMMENT ON COLUMN "users"."manager_id" IS 'Direct manager';`)

    const mikro = generateCodeForTarget(project, 'mikroorm')
    expect(mikro).toContain(`onDelete: 'set null', onUpdate: 'cascade'`)
  })

  it('parses single-line SQL, NUMERIC(10, 2), FKs, indexes and comments accurately', () => {
    const sql = `
      CREATE TYPE role_kind AS ENUM ('admin', 'member');
      CREATE TABLE employees (id BIGSERIAL PRIMARY KEY, salary NUMERIC(10, 2) NOT NULL, manager_id BIGINT, role role_kind DEFAULT 'member', CONSTRAINT fk_mgr FOREIGN KEY (manager_id) REFERENCES employees (id) ON DELETE SET NULL ON UPDATE CASCADE);
      CREATE INDEX idx_employees_mgr ON employees (manager_id);
      CREATE UNIQUE INDEX idx_employees_mgr_role ON employees (manager_id, role);
      COMMENT ON TABLE employees IS 'Staff directory';
      COMMENT ON COLUMN employees.salary IS 'Annual gross';
    `

    const parsed = parseCodeToProject(sql, 'sql', EMPTY_PROJECT)
    expect(parsed.enums).toHaveLength(1)
    expect(parsed.enums[0]!.values).toEqual(['admin', 'member'])

    const emp = parsed.tables[0]!
    expect(emp.comment).toBe('Staff directory')
    const idCol = emp.columns.find(c => c.name === 'id')!
    expect(idCol.type).toBe('BIGINT')
    expect(idCol.isAutoIncrement).toBe(true)

    const salaryCol = emp.columns.find(c => c.name === 'salary')!
    expect(salaryCol.type).toBe('DECIMAL')
    expect(salaryCol.comment).toBe('Annual gross')

    const mgrCol = emp.columns.find(c => c.name === 'manager_id')!
    expect(mgrCol.isIndexed).toBe(true)
    expect(mgrCol.foreignKey).toEqual({
      targetTableId: emp.id,
      targetColumnId: idCol.id,
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    })

    expect(emp.indexes).toHaveLength(1)
    expect(emp.indexes![0]).toMatchObject({
      name: 'idx_employees_mgr_role',
      columnNames: ['manager_id', 'role'],
      isUnique: true
    })
  })

  it('parses Drizzle enums, .references() and index callbacks', () => {
    const drizzleCode = `
      import { pgTable, pgEnum, serial, varchar, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
      export const tierEnum = pgEnum('tier', ['free', 'pro']);
      export const orgs = pgTable('orgs', {
        id: serial('id').primaryKey(),
        name: varchar('name', { length: 120 }).notNull(),
      });
      export const members = pgTable('members', {
        id: serial('id').primaryKey(),
        orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade', onUpdate: 'restrict' }),
        tier: tierEnum('tier').notNull().default('free'),
      }, (table) => ({
        orgIdx: index('members_org_idx').on(table.orgId),
        uniqIdx: uniqueIndex('members_org_tier_uq').on(table.orgId, table.tier),
      }));
    `

    const parsed = parseCodeToProject(drizzleCode, 'drizzle', EMPTY_PROJECT)
    expect(parsed.enums.map(e => e.name)).toContain('Tier')
    expect(parsed.enums[0]!.values).toEqual(['free', 'pro'])

    const orgs = parsed.tables.find(t => t.name === 'orgs')!
    const members = parsed.tables.find(t => t.name === 'members')!

    const orgIdCol = members.columns.find(c => c.name === 'org_id')!
    expect(orgIdCol.isIndexed).toBe(true)
    expect(orgIdCol.foreignKey).toEqual({
      targetTableId: orgs.id,
      targetColumnId: orgs.columns[0]!.id,
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    })

    const tierCol = members.columns.find(c => c.name === 'tier')!
    expect(tierCol.type).toBe('ENUM')
    expect(tierCol.enumName).toBe('Tier')
    expect(tierCol.defaultValue).toBe('free')
    expect(members.indexes).toHaveLength(1)
    expect(members.indexes![0]!.columnNames).toEqual(['org_id', 'tier'])
    expect(members.indexes![0]!.isUnique).toBe(true)
  })

  it('round-trips VARCHAR(length) and DECIMAL(precision, scale) across SQL, Drizzle, Prisma and MikroORM', () => {
    const project: DatabaseProject = {
      ...EMPTY_PROJECT,
      tables: [
        {
          id: 't-ledger',
          name: 'ledger',
          schemaId: 'schema-public',
          position: { x: 0, y: 0 },
          columns: [
            { id: 'c-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
            { id: 'c-2', name: 'code', type: 'VARCHAR', length: 32, isPrimaryKey: false, isNullable: false, isUnique: false },
            { id: 'c-3', name: 'amount', type: 'DECIMAL', precision: 14, scale: 4, isPrimaryKey: false, isNullable: false, isUnique: false }
          ]
        }
      ]
    }

    const sql = generateCodeForTarget(project, 'sql')
    expect(sql).toContain('"code" VARCHAR(32) NOT NULL')
    expect(sql).toContain('"amount" NUMERIC(14, 4) NOT NULL')
    const parsedSql = parseCodeToProject(sql, 'sql', EMPTY_PROJECT)
    expect(parsedSql.tables[0]!.columns[1]!.length).toBe(32)
    expect(parsedSql.tables[0]!.columns[2]!.precision).toBe(14)
    expect(parsedSql.tables[0]!.columns[2]!.scale).toBe(4)

    const drizzle = generateCodeForTarget(project, 'drizzle')
    expect(drizzle).toContain(`varchar('code', { length: 32 })`)
    expect(drizzle).toContain(`decimal('amount', { precision: 14, scale: 4 })`)
    const parsedDrizzle = parseCodeToProject(drizzle, 'drizzle', EMPTY_PROJECT)
    expect(parsedDrizzle.tables[0]!.columns[1]!.length).toBe(32)
    expect(parsedDrizzle.tables[0]!.columns[2]!.precision).toBe(14)
    expect(parsedDrizzle.tables[0]!.columns[2]!.scale).toBe(4)

    const prisma = generateCodeForTarget(project, 'prisma')
    expect(prisma).toContain('@db.VarChar(32)')
    expect(prisma).toContain('@db.Decimal(14, 4)')
    const parsedPrisma = parseCodeToProject(prisma, 'prisma', EMPTY_PROJECT)
    expect(parsedPrisma.tables[0]!.columns[1]!.length).toBe(32)
    expect(parsedPrisma.tables[0]!.columns[2]!.precision).toBe(14)
    expect(parsedPrisma.tables[0]!.columns[2]!.scale).toBe(4)

    const mikro = generateCodeForTarget(project, 'mikroorm')
    expect(mikro).toContain('length: 32')
    expect(mikro).toContain('precision: 14, scale: 4')
    const parsedMikro = parseCodeToProject(mikro, 'mikroorm', EMPTY_PROJECT)
    expect(parsedMikro.tables[0]!.columns[1]!.length).toBe(32)
    expect(parsedMikro.tables[0]!.columns[2]!.precision).toBe(14)
    expect(parsedMikro.tables[0]!.columns[2]!.scale).toBe(4)
  })
})
