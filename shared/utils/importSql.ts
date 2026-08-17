import type { DatabaseProject, Table } from '../types/schema'
import { parseSqlToProject } from '../parsers/sqlParser'

/**
 * Import SQL DDL into an existing database.
 *
 * Audit PAR-10: the React app maintained a second, divergent SQL parser
 * (`utils/sqlImporter.ts`) purely for this modal. It routes through the real
 * parser now.
 *
 * The parser's own contract is "the code *is* the schema" — it returns only the
 * tables it found, which is right for the code panel's Apply but wrong for an
 * import, where dropping every table the pasted DDL happens not to mention
 * would be a silent data loss. So the result is merged rather than substituted:
 * a table matching one that already exists by name is refreshed in place (and
 * keeps its id, so inbound foreign keys survive), everything else is left alone.
 */
export interface SqlImportResult {
  project: DatabaseProject
  added: string[]
  updated: string[]
}

export function mergeImportedSql(current: DatabaseProject, sql: string): SqlImportResult {
  const parsed = parseSqlToProject(sql, current)

  const existingByName = new Map(current.tables.map(t => [t.name, t]))
  const importedNames = new Set(parsed.tables.map(t => t.name))

  const added: string[] = []
  const updated: string[] = []

  const imported: Table[] = parsed.tables.map((t) => {
    const existing = existingByName.get(t.name)
    if (!existing) {
      added.push(t.name)
      return t
    }
    updated.push(t.name)
    // Reusing the id keeps foreign keys that point at this table pointing at it.
    return { ...t, id: existing.id }
  })

  const untouched = current.tables.filter(t => !importedNames.has(t.name))

  return {
    project: {
      ...current,
      // The parser folds any CREATE SCHEMA it saw into the existing set.
      schemas: parsed.schemas,
      tables: [...untouched, ...imported]
    },
    added,
    updated
  }
}
