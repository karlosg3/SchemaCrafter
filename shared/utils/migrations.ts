import type { DatabaseProject } from '../types/schema'
import type {
  EnumEntity,
  SchemaEntity,
  TableEntity,
  Workspace
} from '../types/workspace'
import {
  WORKSPACE_FORMAT_VERSION,
  emptyWorkspace,
  gradientFromColor
} from '../types/workspace'
import { createId } from './ids'
import { dropKey } from './records'

/**
 * v1 -> v2 storage migration.
 *
 * v1 persisted `DatabaseProject[]` under `schemacrafter_database_projects_v1`
 * with no version field inside the payload — only the `_v1` key suffix — and no
 * validation beyond `Array.isArray(parsed) && parsed.length > 0`. Both are
 * fixed here (audit ENG-8 and APP-8).
 *
 * Pure and side-effect free so it can be tested without a DOM. The storage
 * plumbing lives in app/stores/workspace.ts.
 */

export const V1_PROJECTS_KEY = 'schemacrafter_database_projects_v1'
export const V1_ACTIVE_DB_KEY = 'schemacrafter_active_db_id_v1'
export const WORKSPACE_KEY = 'schemacrafter_workspace_v2'
export const UI_STATE_KEY = 'schemacrafter_ui_v2'

export function migrateV1ToWorkspace(projects: DatabaseProject[]): Workspace {
  const ws = emptyWorkspace()

  for (const project of projects) {
    const schemaIds: string[] = []

    for (const s of project.schemas ?? []) {
      const schema: SchemaEntity = {
        id: s.id,
        dbId: project.id,
        name: s.name,
        gradient: gradientFromColor(s.color),
        tableIds: [],
        enumIds: [],
        ...(s.position ? { position: s.position } : {}),
        ...(s.comment ? { comment: s.comment } : {})
      }
      ws.schemas[s.id] = schema
      schemaIds.push(s.id)
    }

    /**
     * v1 allowed `Table.schemaId` to be undefined — deleting a schema orphaned
     * its tables rather than reassigning them. v2 requires a schema, so any
     * orphan lands in `public`, created on demand.
     */
    const ensurePublicSchema = (): string => {
      const existing = schemaIds
        .map(id => ws.schemas[id])
        .find(s => s?.name === 'public')
      if (existing) return existing.id

      const id = createId('schema')
      ws.schemas[id] = {
        id,
        dbId: project.id,
        name: 'public',
        gradient: gradientFromColor('#64748b'),
        tableIds: [],
        enumIds: []
      }
      schemaIds.push(id)
      return id
    }

    const resolveSchemaId = (candidate: string | undefined): string => {
      if (candidate && ws.schemas[candidate]) return candidate
      return schemaIds[0] && ws.schemas[schemaIds[0]] ? schemaIds[0] : ensurePublicSchema()
    }

    for (const t of project.tables ?? []) {
      const schemaId = resolveSchemaId(t.schemaId)
      const table: TableEntity = {
        id: t.id,
        schemaId,
        name: t.name,
        gradient: gradientFromColor(t.color),
        columns: t.columns ?? [],
        ...(t.indexes ? { indexes: t.indexes } : {}),
        position: t.position ?? { x: 80, y: 80 },
        ...(t.comment ? { comment: t.comment } : {})
      }
      ws.tables[t.id] = table
      ws.schemas[schemaId]!.tableIds.push(t.id)
    }

    for (const e of project.enums ?? []) {
      const schemaId = resolveSchemaId(e.schemaId)
      const enumEntity: EnumEntity = {
        id: e.id,
        schemaId,
        name: e.name,
        values: e.values ?? [],
        ...(e.position ? { position: e.position } : {}),
        ...(e.comment ? { comment: e.comment } : {})
      }
      ws.enums[e.id] = enumEntity
      ws.schemas[schemaId]!.enumIds.push(e.id)
    }

    ws.databases.push({
      id: project.id,
      name: project.name,
      engine: project.engine,
      gradient: gradientFromColor(project.schemas?.[0]?.color),
      schemaIds
    })
  }

  return ws
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Structural check on a persisted v2 payload.
 *
 * v1's loader trusted any array it found, so a malformed payload surfaced later
 * as a crash deep in a generator. This rejects it up front.
 */
export function isValidWorkspace(value: unknown): value is Workspace {
  if (!isObject(value)) return false
  if (value.formatVersion !== WORKSPACE_FORMAT_VERSION) return false
  if (!Array.isArray(value.databases)) return false
  if (!isObject(value.schemas) || !isObject(value.tables) || !isObject(value.enums)) return false

  const schemas = value.schemas as Record<string, unknown>
  const tables = value.tables as Record<string, unknown>

  for (const db of value.databases) {
    if (!isObject(db)) return false
    if (typeof db.id !== 'string' || typeof db.name !== 'string') return false
    if (!Array.isArray(db.schemaIds)) return false
  }

  for (const schema of Object.values(schemas)) {
    if (!isObject(schema)) return false
    if (typeof schema.id !== 'string' || typeof schema.name !== 'string') return false
    if (!Array.isArray(schema.tableIds) || !Array.isArray(schema.enumIds)) return false
  }

  for (const table of Object.values(tables)) {
    if (!isObject(table)) return false
    if (typeof table.id !== 'string' || typeof table.schemaId !== 'string') return false
    if (!Array.isArray(table.columns)) return false
  }

  return true
}

/** v1 payloads were a bare `DatabaseProject[]`. */
export function isValidV1Payload(value: unknown): value is DatabaseProject[] {
  if (!Array.isArray(value) || value.length === 0) return false

  return value.every(project =>
    isObject(project)
    && typeof project.id === 'string'
    && typeof project.name === 'string'
    && Array.isArray(project.tables)
  )
}

/**
 * Repair a workspace whose membership lists disagree with its entities —
 * dangling ids, entities no schema claims, foreign keys to deleted columns.
 *
 * Runs after every load so a payload hand-edited or written by an older build
 * cannot put the canvas into a state the renderer chokes on.
 */
export function reconcileWorkspace(ws: Workspace): Workspace {
  const schemas = { ...ws.schemas }
  const tables = { ...ws.tables }
  const enums = { ...ws.enums }

  // Drop schema references to entities that no longer exist.
  for (const schema of Object.values(schemas)) {
    schemas[schema.id] = {
      ...schema,
      tableIds: schema.tableIds.filter(id => tables[id]),
      enumIds: schema.enumIds.filter(id => enums[id])
    }
  }

  // Drop entities whose schema is gone, and databases' references to dead schemas.
  for (const table of Object.values(tables)) {
    if (!schemas[table.schemaId]) dropKey(tables, table.id)
  }
  for (const enumEntity of Object.values(enums)) {
    if (!schemas[enumEntity.schemaId]) dropKey(enums, enumEntity.id)
  }

  // Adopt any entity its schema forgot to list.
  for (const table of Object.values(tables)) {
    const schema = schemas[table.schemaId]!
    if (!schema.tableIds.includes(table.id)) {
      schemas[table.schemaId] = { ...schema, tableIds: [...schema.tableIds, table.id] }
    }
  }
  for (const enumEntity of Object.values(enums)) {
    const schema = schemas[enumEntity.schemaId]!
    if (!schema.enumIds.includes(enumEntity.id)) {
      schemas[enumEntity.schemaId] = { ...schema, enumIds: [...schema.enumIds, enumEntity.id] }
    }
  }

  // Clear foreign keys pointing at a table or column that no longer exists.
  for (const table of Object.values(tables)) {
    let changed = false
    const columns = table.columns.map((col) => {
      if (!col.foreignKey) return col
      const target = tables[col.foreignKey.targetTableId]
      const targetCol = target?.columns.some(c => c.id === col.foreignKey!.targetColumnId)
      if (target && targetCol) return col

      changed = true
      const { foreignKey: _dropped, ...rest } = col
      return rest
    })
    if (changed) tables[table.id] = { ...table, columns }
  }

  return {
    ...ws,
    databases: ws.databases.map(db => ({
      ...db,
      schemaIds: db.schemaIds.filter(id => schemas[id])
    })),
    schemas,
    tables,
    enums
  }
}
