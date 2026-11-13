import type { Column, DatabaseEngine, DatabaseProject, IndexDefinition, Table } from '../types/schema'

export interface SqlDiffSummary {
  tablesAdded: number
  tablesDropped: number
  tablesRenamed: number
  columnsAdded: number
  columnsDropped: number
  columnsAltered: number
}

export interface SqlDiffResult {
  statements: string[]
  sql: string
  summary: SqlDiffSummary
}

function q(name: string, engine: DatabaseEngine): string {
  const clean = name.replace(/["`]/g, '')
  return engine === 'mysql' ? `\`${clean}\`` : `"${clean}"`
}

function sqlType(col: Column, engine: DatabaseEngine): string {
  if (col.type === 'ENUM' && col.enumName) {
    return engine === 'postgresql' ? q(col.enumName.toLowerCase(), engine) : 'VARCHAR(255)'
  }
  switch (col.type) {
    case 'INT': return col.isAutoIncrement ? (engine === 'postgresql' ? 'SERIAL' : 'INT AUTO_INCREMENT') : 'INTEGER'
    case 'BIGINT': return col.isAutoIncrement ? (engine === 'postgresql' ? 'BIGSERIAL' : 'BIGINT AUTO_INCREMENT') : 'BIGINT'
    case 'VARCHAR': return `VARCHAR(${col.length ?? 255})`
    case 'TEXT': return 'TEXT'
    case 'UUID': return engine === 'postgresql' ? 'UUID' : 'VARCHAR(36)'
    case 'BOOLEAN': return engine === 'postgresql' ? 'BOOLEAN' : 'TINYINT(1)'
    case 'DECIMAL': return `NUMERIC(${col.precision ?? 10}, ${col.scale ?? 2})`
    case 'FLOAT': return 'DOUBLE PRECISION'
    case 'TIMESTAMP': return engine === 'postgresql' ? 'TIMESTAMPTZ' : 'DATETIME'
    case 'DATE': return 'DATE'
    case 'JSON': return engine === 'postgresql' ? 'JSONB' : 'JSON'
    default: return 'VARCHAR(255)'
  }
}

function formatDefault(col: Column): string {
  if (col.defaultValue === undefined) return ''
  const v = col.defaultValue
  if (/now\(\)|current_timestamp/i.test(v)) return 'DEFAULT CURRENT_TIMESTAMP'
  if (/gen_random_uuid\(\)|uuid\(\)/i.test(v)) return 'DEFAULT gen_random_uuid()'
  if (col.type === 'BOOLEAN' || col.type === 'INT' || col.type === 'BIGINT' || col.type === 'DECIMAL' || col.type === 'FLOAT') {
    return `DEFAULT ${v}`
  }
  return `DEFAULT '${v.replace(/'/g, "''")}'`
}

function colDefinition(col: Column, engine: DatabaseEngine): string {
  const parts = [q(col.name, engine), sqlType(col, engine)]
  if (!col.isNullable && !col.isPrimaryKey) parts.push('NOT NULL')
  if (col.isPrimaryKey) parts.push('PRIMARY KEY')
  else if (col.isUnique) parts.push('UNIQUE')
  const def = formatDefault(col)
  if (def) parts.push(def)
  return parts.join(' ')
}

function createTableSql(table: Table, engine: DatabaseEngine): string {
  const lines = table.columns.map(c => `  ${colDefinition(c, engine)}`)
  return `CREATE TABLE ${q(table.name, engine)} (\n${lines.join(',\n')}\n);`
}

function createIndexSql(tableName: string, idx: IndexDefinition, engine: DatabaseEngine): string {
  const unique = idx.isUnique ? 'UNIQUE ' : ''
  const cols = idx.columnNames.map(c => q(c, engine)).join(', ')
  return `CREATE ${unique}INDEX ${q(idx.name, engine)} ON ${q(tableName, engine)} (${cols});`
}

function sameTypeSignature(a: Column, b: Column, engine: DatabaseEngine): boolean {
  return sqlType(a, engine) === sqlType(b, engine)
}

/**
 * Generates an incremental SQL migration (`ALTER TABLE`, `CREATE TABLE`, `DROP TABLE`, indexes & FKs)
 * from a baseline DatabaseProject snapshot to the current DatabaseProject.
 */
export function diffProjectToAlterSql(before: DatabaseProject, after: DatabaseProject): SqlDiffResult {
  const engine = after.engine
  const statements: string[] = []
  const summary: SqlDiffSummary = {
    tablesAdded: 0,
    tablesDropped: 0,
    tablesRenamed: 0,
    columnsAdded: 0,
    columnsDropped: 0,
    columnsAltered: 0
  }

  // New enums (PostgreSQL)
  if (engine === 'postgresql') {
    const beforeEnumNames = new Set((before.enums ?? []).map(e => e.name.toLowerCase()))
    for (const en of after.enums ?? []) {
      if (!beforeEnumNames.has(en.name.toLowerCase())) {
        const vals = en.values.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')
        statements.push(`CREATE TYPE ${q(en.name.toLowerCase(), engine)} AS ENUM (${vals});`)
      }
    }
  }

  const beforeByName = new Map(before.tables.map(t => [t.name.toLowerCase(), t]))
  const beforeById = new Map(before.tables.map(t => [t.id, t]))
  const matchedBeforeIds = new Set<string>()
  const afterTableMap = new Map(after.tables.map(t => [t.id, t]))

  // Pair up tables (exact name first, fallback to id to catch renames)
  const pairs: Array<{ oldTable?: Table, newTable: Table }> = []
  for (const nt of after.tables) {
    const byName = beforeByName.get(nt.name.toLowerCase())
    if (byName && !matchedBeforeIds.has(byName.id)) {
      matchedBeforeIds.add(byName.id)
      pairs.push({ oldTable: byName, newTable: nt })
      continue
    }
    const byId = beforeById.get(nt.id)
    if (byId && !matchedBeforeIds.has(byId.id)) {
      matchedBeforeIds.add(byId.id)
      pairs.push({ oldTable: byId, newTable: nt })
      continue
    }
    pairs.push({ newTable: nt })
  }

  // Dropped tables
  for (const ot of before.tables) {
    if (!matchedBeforeIds.has(ot.id)) {
      summary.tablesDropped++
      statements.push(`DROP TABLE IF EXISTS ${q(ot.name, engine)};`)
    }
  }

  // Added / altered tables
  for (const { oldTable, newTable } of pairs) {
    if (!oldTable) {
      summary.tablesAdded++
      statements.push(createTableSql(newTable, engine))
      for (const idx of newTable.indexes ?? []) {
        statements.push(createIndexSql(newTable.name, idx, engine))
      }
      continue
    }

    if (oldTable.name !== newTable.name) {
      summary.tablesRenamed++
      statements.push(`ALTER TABLE ${q(oldTable.name, engine)} RENAME TO ${q(newTable.name, engine)};`)
    }

    const oldColByName = new Map(oldTable.columns.map(c => [c.name.toLowerCase(), c]))
    const newColByName = new Map(newTable.columns.map(c => [c.name.toLowerCase(), c]))

    // Dropped columns
    for (const oc of oldTable.columns) {
      if (!newColByName.has(oc.name.toLowerCase())) {
        summary.columnsDropped++
        statements.push(`ALTER TABLE ${q(newTable.name, engine)} DROP COLUMN ${q(oc.name, engine)};`)
      }
    }

    // Added / altered columns
    for (const nc of newTable.columns) {
      const oc = oldColByName.get(nc.name.toLowerCase())
      if (!oc) {
        summary.columnsAdded++
        statements.push(`ALTER TABLE ${q(newTable.name, engine)} ADD COLUMN ${colDefinition(nc, engine)};`)
        continue
      }

      const typeChanged = !sameTypeSignature(oc, nc, engine)
      const nullChanged = oc.isNullable !== nc.isNullable
      const defaultChanged = (oc.defaultValue ?? '') !== (nc.defaultValue ?? '')

      if (typeChanged || nullChanged || defaultChanged) {
        summary.columnsAltered++
        if (engine === 'mysql') {
          statements.push(`ALTER TABLE ${q(newTable.name, engine)} MODIFY COLUMN ${colDefinition(nc, engine)};`)
        } else if (engine === 'sqlite') {
          statements.push(`-- SQLite requires table recreation to alter ${newTable.name}.${nc.name}`)
        } else {
          if (typeChanged) {
            statements.push(
              `ALTER TABLE ${q(newTable.name, engine)} ALTER COLUMN ${q(nc.name, engine)} TYPE ${sqlType(nc, engine)};`
            )
          }
          if (nullChanged) {
            statements.push(
              `ALTER TABLE ${q(newTable.name, engine)} ALTER COLUMN ${q(nc.name, engine)} ${nc.isNullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`
            )
          }
          if (defaultChanged) {
            statements.push(
              nc.defaultValue !== undefined
                ? `ALTER TABLE ${q(newTable.name, engine)} ALTER COLUMN ${q(nc.name, engine)} ${formatDefault(nc).replace(/^DEFAULT /, 'SET DEFAULT ')};`
                : `ALTER TABLE ${q(newTable.name, engine)} ALTER COLUMN ${q(nc.name, engine)} DROP DEFAULT;`
            )
          }
        }
      }

      // FK changes
      const oldFk = oc.foreignKey
      const newFk = nc.foreignKey
      const fkChanged =
        oldFk?.targetTableId !== newFk?.targetTableId
        || oldFk?.targetColumnId !== newFk?.targetColumnId
        || oldFk?.onDelete !== newFk?.onDelete
        || oldFk?.onUpdate !== newFk?.onUpdate

      if (fkChanged && engine !== 'sqlite') {
        const constraintName = q(`fk_${newTable.name}_${nc.name}`, engine)
        if (oldFk) {
          statements.push(
            engine === 'mysql'
              ? `ALTER TABLE ${q(newTable.name, engine)} DROP FOREIGN KEY ${constraintName};`
              : `ALTER TABLE ${q(newTable.name, engine)} DROP CONSTRAINT IF EXISTS ${constraintName};`
          )
        }
        if (newFk) {
          const targetTable = afterTableMap.get(newFk.targetTableId)
          const targetCol = targetTable?.columns.find(c => c.id === newFk.targetColumnId)
          if (targetTable && targetCol) {
            let clause = `ALTER TABLE ${q(newTable.name, engine)} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${q(nc.name, engine)}) REFERENCES ${q(targetTable.name, engine)} (${q(targetCol.name, engine)})`
            if (newFk.onDelete) clause += ` ON DELETE ${newFk.onDelete}`
            if (newFk.onUpdate) clause += ` ON UPDATE ${newFk.onUpdate}`
            statements.push(`${clause};`)
          }
        }
      }
    }

    // Index diffs
    const oldIdxMap = new Map((oldTable.indexes ?? []).map(i => [i.name, i]))
    const newIdxMap = new Map((newTable.indexes ?? []).map(i => [i.name, i]))
    for (const oldIdx of oldIdxMap.values()) {
      const next = newIdxMap.get(oldIdx.name)
      const same = next
        && Boolean(next.isUnique) === Boolean(oldIdx.isUnique)
        && next.columnNames.join(',') === oldIdx.columnNames.join(',')
      if (!same) {
        statements.push(`DROP INDEX IF EXISTS ${q(oldIdx.name, engine)};`)
      }
    }
    for (const newIdx of newIdxMap.values()) {
      const prev = oldIdxMap.get(newIdx.name)
      const same = prev
        && Boolean(prev.isUnique) === Boolean(newIdx.isUnique)
        && prev.columnNames.join(',') === newIdx.columnNames.join(',')
      if (!same) {
        statements.push(createIndexSql(newTable.name, newIdx, engine))
      }
    }
  }

  const sql = statements.length > 0
    ? statements.join('\n\n')
    : '-- No schema changes detected.'

  return { statements, sql, summary }
}
