import type {
  DatabaseProject,
  EnumDefinition,
  SchemaGroup,
  Table
} from '../types/schema'
import type { Workspace } from '../types/workspace'
import { gradientFromColor } from '../types/workspace'
import { createId } from './ids'
import { dropKey } from './records'

/**
 * The adapter between the canonical Workspace and the legacy DatabaseProject
 * the 5 generators and 4 parsers consume.
 *
 * Those 9 files are ~1200 lines of regex-and-string code with most of the audit
 * register still open against them. Reprojecting here is far cheaper than
 * rewriting their input shape, and it keeps the golden-file snapshots valid.
 */

/** Schemas belonging to `dbId`, in the database's declared order. */
function schemasOf(ws: Workspace, dbId: string) {
  const db = ws.databases.find(d => d.id === dbId)
  if (!db) return []
  return db.schemaIds.map(id => ws.schemas[id]).filter(s => s !== undefined)
}

/**
 * Workspace -> DatabaseProject for one database.
 *
 * Lossy by design in one direction only: gradients collapse to their `from`
 * colour and node sizes are dropped, because `DatabaseProject` has nowhere to
 * put them. Nothing the generators read is lost.
 */
export function toDatabaseProject(ws: Workspace, dbId: string): DatabaseProject {
  const db = ws.databases.find(d => d.id === dbId)
  if (!db) {
    throw new Error(`toDatabaseProject: no database with id "${dbId}"`)
  }

  const schemas = schemasOf(ws, dbId)

  const schemaGroups: SchemaGroup[] = schemas.map(s => ({
    id: s.id,
    name: s.name,
    color: s.gradient[0],
    ...(s.position ? { position: s.position } : {}),
    ...(s.comment ? { comment: s.comment } : {})
  }))

  const tables: Table[] = schemas.flatMap(s =>
    s.tableIds
      .map(id => ws.tables[id])
      .filter(t => t !== undefined)
      .map((t): Table => ({
        id: t.id,
        name: t.name,
        schemaId: t.schemaId,
        columns: t.columns,
        ...(t.indexes ? { indexes: t.indexes } : {}),
        position: t.position,
        ...(t.comment ? { comment: t.comment } : {}),
        color: t.gradient[0]
      }))
  )

  const enums: EnumDefinition[] = schemas.flatMap(s =>
    s.enumIds
      .map(id => ws.enums[id])
      .filter(e => e !== undefined)
      .map((e): EnumDefinition => ({
        id: e.id,
        name: e.name,
        values: e.values,
        schemaId: e.schemaId,
        ...(e.position ? { position: e.position } : {}),
        ...(e.comment ? { comment: e.comment } : {})
      }))
  )

  return {
    id: db.id,
    name: db.name,
    engine: db.engine,
    schemas: schemaGroups,
    enums,
    tables
  }
}

/**
 * Merge a parser's DatabaseProject back into the workspace, replacing that
 * database's contents.
 *
 * Fields the code format cannot express — gradients, node sizes, and positions
 * the parser did not supply — are carried over from the existing entity of the
 * same id. This is the shared merge audit PAR-6 asks for; the parsers each grew
 * their own near-duplicate version of it.
 *
 * Returns a new Workspace; the input is not mutated.
 */
export function applyParsedProject(
  ws: Workspace,
  dbId: string,
  parsed: DatabaseProject
): Workspace {
  const db = ws.databases.find(d => d.id === dbId)
  if (!db) {
    throw new Error(`applyParsedProject: no database with id "${dbId}"`)
  }

  const previousSchemaIds = new Set(db.schemaIds)
  const nextSchemas = { ...ws.schemas }
  const nextTables = { ...ws.tables }
  const nextEnums = { ...ws.enums }

  // Drop everything currently under this database; re-add from `parsed` below.
  // Other databases are untouched.
  for (const schemaId of previousSchemaIds) {
    const schema = ws.schemas[schemaId]
    if (!schema) continue
    for (const tableId of schema.tableIds) dropKey(nextTables, tableId)
    for (const enumId of schema.enumIds) dropKey(nextEnums, enumId)
    dropKey(nextSchemas, schemaId)
  }

  // A parsed project with no schemas still needs somewhere to hang its tables.
  const parsedSchemas = parsed.schemas.length > 0
    ? parsed.schemas
    : [{ id: createId('schema'), name: 'public', color: '#64748b' } satisfies SchemaGroup]

  const fallbackSchemaId = parsedSchemas[0]!.id
  const schemaIds: string[] = []

  for (const s of parsedSchemas) {
    const before = ws.schemas[s.id]
    nextSchemas[s.id] = {
      id: s.id,
      dbId,
      name: s.name,
      gradient: before?.gradient ?? gradientFromColor(s.color),
      tableIds: [],
      enumIds: [],
      position: s.position ?? before?.position,
      size: before?.size,
      comment: s.comment ?? before?.comment
    }
    schemaIds.push(s.id)
  }

  for (const t of parsed.tables) {
    const schemaId = t.schemaId && nextSchemas[t.schemaId] ? t.schemaId : fallbackSchemaId
    const before = ws.tables[t.id]

    nextTables[t.id] = {
      id: t.id,
      schemaId,
      name: t.name,
      gradient: before?.gradient ?? gradientFromColor(t.color),
      columns: t.columns,
      indexes: t.indexes ?? before?.indexes,
      position: t.position ?? before?.position ?? { x: 80, y: 80 },
      size: before?.size,
      comment: t.comment ?? before?.comment
    }
    nextSchemas[schemaId]!.tableIds.push(t.id)
  }

  for (const e of parsed.enums ?? []) {
    const schemaId = e.schemaId && nextSchemas[e.schemaId] ? e.schemaId : fallbackSchemaId
    const before = ws.enums[e.id]

    nextEnums[e.id] = {
      id: e.id,
      schemaId,
      name: e.name,
      values: e.values,
      position: e.position ?? before?.position,
      size: before?.size,
      comment: e.comment ?? before?.comment
    }
    nextSchemas[schemaId]!.enumIds.push(e.id)
  }

  return {
    ...ws,
    databases: ws.databases.map(d =>
      d.id === dbId ? { ...d, name: parsed.name, engine: parsed.engine, schemaIds } : d
    ),
    schemas: nextSchemas,
    tables: nextTables,
    enums: nextEnums
  }
}

/**
 * Resolve `Column.enumName` to an enum id **within the owning schema**.
 *
 * The legacy model links columns to enums by bare name. Once several schemas
 * can coexist, two of them may legally define an enum with the same name, so a
 * global name lookup would pick the wrong one.
 */
export function findEnumForColumn(
  ws: Workspace,
  schemaId: string,
  enumName: string | undefined
): string | undefined {
  if (!enumName) return undefined
  const schema = ws.schemas[schemaId]
  if (!schema) return undefined

  return schema.enumIds.find(id => ws.enums[id]?.name === enumName)
}

/** Used by the sidebar and by default-name generation. */
export function tablesOfDatabase(ws: Workspace, dbId: string) {
  return schemasOf(ws, dbId).flatMap(s =>
    s.tableIds.map(id => ws.tables[id]).filter(t => t !== undefined)
  )
}

export function enumsOfDatabase(ws: Workspace, dbId: string) {
  return schemasOf(ws, dbId).flatMap(s =>
    s.enumIds.map(id => ws.enums[id]).filter(e => e !== undefined)
  )
}

export { schemasOf }
