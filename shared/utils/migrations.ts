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
        columns: (t.columns ?? []).map(col => ({
          ...col,
          ...(col.foreignKey ? { foreignKey: { ...col.foreignKey } } : {})
        })),
        ...(t.indexes
          ? {
              indexes: t.indexes.map(idx => ({
                ...idx,
                columnNames: [...idx.columnNames]
              }))
            }
          : {}),
        position: t.position ? { ...t.position } : { x: 80, y: 80 },
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
        values: [...(e.values ?? [])],
        ...(e.position ? { position: { ...e.position } } : {}),
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

const VALID_ENGINES = new Set(['postgresql', 'mysql', 'sqlite'])
const VALID_DATA_TYPES = new Set([
  'INT', 'BIGINT', 'VARCHAR', 'TEXT', 'BOOLEAN', 'UUID',
  'DECIMAL', 'FLOAT', 'TIMESTAMP', 'DATE', 'JSON', 'ENUM'
])
const VALID_FK_ACTIONS = new Set(['CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION'])
const VALID_INDEX_TYPES = new Set(['BTREE', 'HASH', 'GIN', 'GIST'])

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string')
}

function isGradient(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string'
}

function isXY(value: unknown): boolean {
  return isObject(value)
    && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y)
}

function isWH(value: unknown): boolean {
  return isObject(value)
    && typeof value.width === 'number' && Number.isFinite(value.width)
    && typeof value.height === 'number' && Number.isFinite(value.height)
}

function isValidForeignKey(fk: unknown): boolean {
  if (!isObject(fk)) return false
  if (typeof fk.targetTableId !== 'string' || typeof fk.targetColumnId !== 'string') return false
  if (fk.onDelete !== undefined && (typeof fk.onDelete !== 'string' || !VALID_FK_ACTIONS.has(fk.onDelete))) return false
  if (fk.onUpdate !== undefined && (typeof fk.onUpdate !== 'string' || !VALID_FK_ACTIONS.has(fk.onUpdate))) return false
  return true
}

function isValidColumn(col: unknown): boolean {
  if (!isObject(col)) return false
  if (typeof col.id !== 'string' || typeof col.name !== 'string') return false
  if (typeof col.type !== 'string' || !VALID_DATA_TYPES.has(col.type)) return false
  if (typeof col.isPrimaryKey !== 'boolean' || typeof col.isNullable !== 'boolean' || typeof col.isUnique !== 'boolean') {
    return false
  }
  if (col.isIndexed !== undefined && typeof col.isIndexed !== 'boolean') return false
  if (col.isAutoIncrement !== undefined && typeof col.isAutoIncrement !== 'boolean') return false
  if (col.length !== undefined && (typeof col.length !== 'number' || !Number.isInteger(col.length) || col.length <= 0)) return false
  if (col.precision !== undefined && (typeof col.precision !== 'number' || !Number.isInteger(col.precision) || col.precision <= 0)) return false
  if (col.scale !== undefined && (typeof col.scale !== 'number' || !Number.isInteger(col.scale) || col.scale < 0)) return false
  if (col.enumName !== undefined && typeof col.enumName !== 'string') return false
  if (col.defaultValue !== undefined && typeof col.defaultValue !== 'string') return false
  if (col.comment !== undefined && typeof col.comment !== 'string') return false
  if (col.foreignKey !== undefined && !isValidForeignKey(col.foreignKey)) return false
  return true
}

function isValidIndex(idx: unknown): boolean {
  if (!isObject(idx)) return false
  if (typeof idx.id !== 'string' || typeof idx.name !== 'string' || !isStringArray(idx.columnNames)) return false
  if (idx.isUnique !== undefined && typeof idx.isUnique !== 'boolean') return false
  if (idx.type !== undefined && (typeof idx.type !== 'string' || !VALID_INDEX_TYPES.has(idx.type))) return false
  return true
}

/**
 * Structural check on a persisted v2 payload.
 *
 * v1's loader trusted any array it found, so a malformed payload surfaced later
 * as a crash deep in a generator. This rejects invalid workspaces, entities,
 * columns, enums, engines and gradients up front.
 */
export function isValidWorkspace(value: unknown): value is Workspace {
  if (!isObject(value)) return false
  if (value.formatVersion !== WORKSPACE_FORMAT_VERSION) return false
  if (!Array.isArray(value.databases)) return false
  if (!isObject(value.schemas) || !isObject(value.tables) || !isObject(value.enums)) return false

  const schemas = value.schemas as Record<string, unknown>
  const tables = value.tables as Record<string, unknown>
  const enums = value.enums as Record<string, unknown>

  for (const db of value.databases) {
    if (!isObject(db)) return false
    if (typeof db.id !== 'string' || typeof db.name !== 'string') return false
    if (typeof db.engine !== 'string' || !VALID_ENGINES.has(db.engine)) return false
    if (!isGradient(db.gradient)) return false
    if (!isStringArray(db.schemaIds)) return false
    if (db.position !== undefined && !isXY(db.position)) return false
    if (db.size !== undefined && !isWH(db.size)) return false
    if (db.comment !== undefined && typeof db.comment !== 'string') return false
  }

  for (const schema of Object.values(schemas)) {
    if (!isObject(schema)) return false
    if (typeof schema.id !== 'string' || typeof schema.dbId !== 'string' || typeof schema.name !== 'string') return false
    if (!isGradient(schema.gradient)) return false
    if (!isStringArray(schema.tableIds) || !isStringArray(schema.enumIds)) return false
    if (schema.position !== undefined && !isXY(schema.position)) return false
    if (schema.size !== undefined && !isWH(schema.size)) return false
    if (schema.comment !== undefined && typeof schema.comment !== 'string') return false
  }

  for (const table of Object.values(tables)) {
    if (!isObject(table)) return false
    if (typeof table.id !== 'string' || typeof table.schemaId !== 'string' || typeof table.name !== 'string') return false
    if (!isGradient(table.gradient)) return false
    if (!isXY(table.position)) return false
    if (table.size !== undefined && !isWH(table.size)) return false
    if (table.comment !== undefined && typeof table.comment !== 'string') return false
    if (!Array.isArray(table.columns) || !table.columns.every(isValidColumn)) return false
    if (table.indexes !== undefined && (!Array.isArray(table.indexes) || !table.indexes.every(isValidIndex))) {
      return false
    }
  }

  for (const enumEntity of Object.values(enums)) {
    if (!isObject(enumEntity)) return false
    if (typeof enumEntity.id !== 'string' || typeof enumEntity.schemaId !== 'string' || typeof enumEntity.name !== 'string') {
      return false
    }
    if (!isStringArray(enumEntity.values)) return false
    if (enumEntity.position !== undefined && !isXY(enumEntity.position)) return false
    if (enumEntity.size !== undefined && !isWH(enumEntity.size)) return false
    if (enumEntity.comment !== undefined && typeof enumEntity.comment !== 'string') return false
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
