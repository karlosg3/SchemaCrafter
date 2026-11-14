import { defineStore } from 'pinia'
import type {
  Column,
  DataType,
  DatabaseEngine,
  DatabaseProject,
  ForeignKeyAction
} from '#shared/types/schema'
import type {
  DatabaseEntity,
  EnumEntity,
  Gradient,
  SchemaEntity,
  TableEntity,
  WH,
  Workspace,
  XY
} from '#shared/types/workspace'
import { DEFAULT_GRADIENT, emptyWorkspace } from '#shared/types/workspace'
import { createId, uniqueName } from '#shared/utils/ids'
import { computeDagSchemaLayout } from '#shared/utils/layout'
import { applyParsedProject, toDatabaseProject } from '#shared/utils/projection'
import { reconcileWorkspace } from '#shared/utils/migrations'
import { dropKey } from '#shared/utils/records'
import type { LoadSource } from '~/utils/persistence'
import { loadWorkspace, saveWorkspace } from '~/utils/persistence'

const AUTOSAVE_DEBOUNCE_MS = 500
const MAX_HISTORY = 50

function cloneWorkspaceSnapshot(ws: Workspace): Workspace {
  return JSON.parse(JSON.stringify(ws)) as Workspace
}

/**
 * Canonical application data.
 *
 * Every action takes the id it operates on rather than reading an "active"
 * pointer from elsewhere. That is what fixes audit APP-1, where editing
 * database B silently wrote to whichever database happened to be active.
 * The active-selection pointers live in the UI store.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const workspace = ref<Workspace>(emptyWorkspace())
  const hydrated = ref(false)
  const loadSource = ref<LoadSource | null>(null)
  const loadWarning = ref<string | null>(null)
  const persistenceMode = ref<'local' | 'file'>('local')
  const revision = ref(0)
  /** Incremented whenever the workspace root is replaced (hydrate/open/new). */
  const resetEpoch = ref(0)

  // ---------------------------------------------------------------- history

  const past = ref<Workspace[]>([])
  const future = ref<Workspace[]>([])
  let historySuspended = false

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function clearHistory(): void {
    past.value = []
    future.value = []
  }

  function recordHistory(): void {
    if (historySuspended) return
    past.value.push(cloneWorkspaceSnapshot(workspace.value))
    if (past.value.length > MAX_HISTORY) {
      past.value.splice(0, past.value.length - MAX_HISTORY)
    }
    if (future.value.length > 0) future.value = []
  }

  function withHistorySuspended<T>(fn: () => T): T {
    const prev = historySuspended
    historySuspended = true
    try {
      return fn()
    } finally {
      historySuspended = prev
    }
  }

  function undo(): boolean {
    const previous = past.value.pop()
    if (!previous) return false
    future.value.push(cloneWorkspaceSnapshot(workspace.value))
    if (future.value.length > MAX_HISTORY) {
      future.value.splice(0, future.value.length - MAX_HISTORY)
    }
    workspace.value = previous
    scheduleSave()
    return true
  }

  function redo(): boolean {
    const next = future.value.pop()
    if (!next) return false
    past.value.push(cloneWorkspaceSnapshot(workspace.value))
    if (past.value.length > MAX_HISTORY) {
      past.value.splice(0, past.value.length - MAX_HISTORY)
    }
    workspace.value = next
    scheduleSave()
    return true
  }

  // ---------------------------------------------------------------- lookups

  const databases = computed(() => workspace.value.databases)

  const database = (id: string): DatabaseEntity | undefined =>
    workspace.value.databases.find(d => d.id === id)

  const schema = (id: string): SchemaEntity | undefined => workspace.value.schemas[id]
  const table = (id: string): TableEntity | undefined => workspace.value.tables[id]
  const enumEntity = (id: string): EnumEntity | undefined => workspace.value.enums[id]

  const schemasOfDatabase = (dbId: string): SchemaEntity[] =>
    database(dbId)?.schemaIds.map(id => workspace.value.schemas[id]).filter(s => !!s) ?? []

  const tablesOfSchema = (schemaId: string): TableEntity[] =>
    schema(schemaId)?.tableIds.map(id => workspace.value.tables[id]).filter(t => !!t) ?? []

  const enumsOfSchema = (schemaId: string): EnumEntity[] =>
    schema(schemaId)?.enumIds.map(id => workspace.value.enums[id]).filter(e => !!e) ?? []

  const tablesOfDatabase = (dbId: string): TableEntity[] =>
    schemasOfDatabase(dbId).flatMap(s => tablesOfSchema(s.id))

  const enumsOfDatabase = (dbId: string): EnumEntity[] =>
    schemasOfDatabase(dbId).flatMap(s => enumsOfSchema(s.id))

  /** The database a schema/table/enum ultimately belongs to. */
  const databaseOfSchema = (schemaId: string): DatabaseEntity | undefined => {
    const dbId = schema(schemaId)?.dbId
    return dbId ? database(dbId) : undefined
  }

  /** The legacy shape the generators and parsers consume. */
  const projectFor = (dbId: string): DatabaseProject => toDatabaseProject(workspace.value, dbId)

  const baselineWorkspace = ref<Workspace>(cloneWorkspaceSnapshot(emptyWorkspace()))

  function captureBaseline(): void {
    baselineWorkspace.value = cloneWorkspaceSnapshot(workspace.value)
  }

  const baselineProjectFor = (dbId: string): DatabaseProject => {
    const hasBaselineDb = baselineWorkspace.value.databases.some(d => d.id === dbId)
    if (!hasBaselineDb) {
      return { ...toDatabaseProject(workspace.value, dbId), schemas: [], enums: [], tables: [] }
    }
    return toDatabaseProject(baselineWorkspace.value, dbId)
  }

  // ------------------------------------------------------------ persistence

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function clearSaveTimer(): void {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  function hydrate(): void {
    if (hydrated.value) return
    clearSaveTimer()
    clearHistory()
    persistenceMode.value = 'local'
    const result = loadWorkspace()
    workspace.value = result.workspace
    captureBaseline()
    loadSource.value = result.source
    loadWarning.value = result.warning ?? null
    resetEpoch.value += 1
    hydrated.value = true
  }

  /** Initializes an empty file-backed workspace for the desktop app. */
  function hydrateDesktopEmpty(): void {
    clearSaveTimer()
    clearHistory()
    persistenceMode.value = 'file'
    workspace.value = emptyWorkspace()
    captureBaseline()
    loadSource.value = null
    loadWarning.value = null
    resetEpoch.value += 1
    hydrated.value = true
  }

  /** Replaces the workspace from a file on disk without writing to localStorage. */
  function loadExternalWorkspace(next: Workspace): void {
    clearSaveTimer()
    clearHistory()
    persistenceMode.value = 'file'
    workspace.value = reconcileWorkspace(next)
    captureBaseline()
    loadSource.value = null
    loadWarning.value = null
    resetEpoch.value += 1
    hydrated.value = true
  }

  function flush(): void {
    clearSaveTimer()
    if (hydrated.value && persistenceMode.value === 'local') saveWorkspace(workspace.value)
  }

  /** Debounced so dragging a node does not write on every animation frame. */
  function scheduleSave(): void {
    revision.value += 1
    if (!hydrated.value || persistenceMode.value !== 'local') return
    clearSaveTimer()
    saveTimer = setTimeout(() => {
      saveTimer = null
      saveWorkspace(workspace.value)
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  // -------------------------------------------------------------- databases

  function createDatabase(name: string, engine: DatabaseEngine = 'postgresql'): DatabaseEntity {
    recordHistory()
    const dbId = createId('db')
    const schemaId = createId('schema')

    workspace.value.schemas[schemaId] = {
      id: schemaId,
      dbId,
      name: 'public',
      gradient: [...DEFAULT_GRADIENT] as Gradient,
      tableIds: [],
      enumIds: []
    }

    const db: DatabaseEntity = {
      id: dbId,
      name,
      engine,
      gradient: [...DEFAULT_GRADIENT] as Gradient,
      schemaIds: [schemaId]
    }
    workspace.value.databases.push(db)
    scheduleSave()
    return db
  }

  /**
   * Takes an explicit id. The React version always wrote to the active project
   * regardless of which one the modal was opened for (audit APP-1).
   */
  function updateDatabase(id: string, patch: Partial<Omit<DatabaseEntity, 'id' | 'schemaIds'>>): void {
    const db = database(id)
    if (!db) return
    recordHistory()
    Object.assign(db, patch)
    scheduleSave()
  }

  function deleteDatabase(id: string): void {
    const db = database(id)
    if (!db) return
    recordHistory()

    for (const schemaId of db.schemaIds) {
      const s = workspace.value.schemas[schemaId]
      if (!s) continue
      for (const tableId of s.tableIds) dropKey(workspace.value.tables, tableId)
      for (const enumId of s.enumIds) dropKey(workspace.value.enums, enumId)
      dropKey(workspace.value.schemas, schemaId)
    }

    workspace.value.databases = workspace.value.databases.filter(d => d.id !== id)
    workspace.value = reconcileWorkspace(workspace.value)
    scheduleSave()
  }

  // ---------------------------------------------------------------- schemas

  function createSchema(dbId: string, name: string, gradient?: Gradient, comment?: string): SchemaEntity | undefined {
    const db = database(dbId)
    if (!db) return undefined
    recordHistory()

    const id = createId('schema')
    const entity: SchemaEntity = {
      id,
      dbId,
      name: uniqueName(name, schemasOfDatabase(dbId).map(s => s.name)),
      gradient: gradient ?? [...DEFAULT_GRADIENT] as Gradient,
      tableIds: [],
      enumIds: [],
      ...(comment ? { comment } : {})
    }
    workspace.value.schemas[id] = entity
    db.schemaIds.push(id)
    scheduleSave()
    return entity
  }

  function updateSchema(id: string, patch: Partial<Omit<SchemaEntity, 'id' | 'dbId' | 'tableIds' | 'enumIds'>>): void {
    const s = schema(id)
    if (!s) return
    recordHistory()
    Object.assign(s, patch)
    scheduleSave()
  }

  /**
   * Tables and enums move to the database's `public` schema rather than being
   * orphaned with an undefined schemaId, which is what the React version did.
   */
  function deleteSchema(id: string): void {
    const s = schema(id)
    if (!s) return
    const db = database(s.dbId)
    if (!db) return
    recordHistory()

    const survivors = db.schemaIds.filter(sid => sid !== id)
    let fallbackId = survivors.find(sid => workspace.value.schemas[sid]?.name === 'public')
      ?? survivors[0]

    if (!fallbackId && (s.tableIds.length > 0 || s.enumIds.length > 0)) {
      fallbackId = withHistorySuspended(() => createSchema(s.dbId, 'public')?.id)
    }

    if (fallbackId) {
      const fallback = workspace.value.schemas[fallbackId]!
      for (const tableId of s.tableIds) {
        const t = workspace.value.tables[tableId]
        if (!t) continue
        t.schemaId = fallbackId
        fallback.tableIds.push(tableId)
      }
      for (const enumId of s.enumIds) {
        const e = workspace.value.enums[enumId]
        if (!e) continue
        e.schemaId = fallbackId
        fallback.enumIds.push(enumId)
      }
    }

    dropKey(workspace.value.schemas, id)
    db.schemaIds = db.schemaIds.filter(sid => sid !== id)
    scheduleSave()
  }

  // ------------------------------------------------------------------ enums

  function createEnum(schemaId: string, name: string, values: string[]): EnumEntity | undefined {
    const s = schema(schemaId)
    if (!s) return undefined
    recordHistory()

    const id = createId('enum')
    const entity: EnumEntity = {
      id,
      schemaId,
      name: uniqueName(name, enumsOfDatabase(s.dbId).map(e => e.name)),
      values: [...values]
    }
    workspace.value.enums[id] = entity
    s.enumIds.push(id)
    scheduleSave()
    return entity
  }

  function updateEnum(id: string, patch: Partial<Omit<EnumEntity, 'id'>>): void {
    const e = enumEntity(id)
    if (!e) return
    recordHistory()

    // Renaming an enum has to follow through to the columns that reference it
    // by name, or they silently decay to a plain column on the next generate.
    if (patch.name && patch.name !== e.name) {
      for (const t of tablesOfDatabase(schema(e.schemaId)?.dbId ?? '')) {
        for (const col of t.columns) {
          if (col.type === 'ENUM' && col.enumName === e.name) col.enumName = patch.name
        }
      }
    }

    if (patch.schemaId && patch.schemaId !== e.schemaId) {
      moveEnumToSchema(id, patch.schemaId)
    }

    Object.assign(e, patch)
    scheduleSave()
  }

  function moveEnumToSchema(id: string, schemaId: string): void {
    const e = enumEntity(id)
    const from = e ? schema(e.schemaId) : undefined
    const to = schema(schemaId)
    if (!e || !from || !to) return

    from.enumIds = from.enumIds.filter(x => x !== id)
    if (!to.enumIds.includes(id)) to.enumIds.push(id)
    e.schemaId = schemaId
  }

  function deleteEnum(id: string): void {
    const e = enumEntity(id)
    if (!e) return
    recordHistory()
    const s = schema(e.schemaId)
    if (s) s.enumIds = s.enumIds.filter(x => x !== id)
    dropKey(workspace.value.enums, id)
    scheduleSave()
  }

  // ----------------------------------------------------------------- tables

  function createTable(schemaId: string, name?: string, position?: XY): TableEntity | undefined {
    const s = schema(schemaId)
    if (!s) return undefined
    recordHistory()

    const id = createId('table')
    const existingNames = tablesOfDatabase(s.dbId).map(t => t.name)
    const entity: TableEntity = {
      id,
      schemaId,
      name: uniqueName(name ?? 'new_table', existingNames),
      gradient: [...DEFAULT_GRADIENT] as Gradient,
      position: position ?? nextFreePosition(schemaId),
      columns: [{
        id: createId('col'),
        name: 'id',
        type: 'UUID',
        isPrimaryKey: true,
        isNullable: false,
        isUnique: true
      }]
    }
    workspace.value.tables[id] = entity
    s.tableIds.push(id)
    scheduleSave()
    return entity
  }

  function updateTable(id: string, patch: Partial<Omit<TableEntity, 'id' | 'columns'>>): void {
    const t = table(id)
    if (!t) return
    recordHistory()

    if (patch.schemaId && patch.schemaId !== t.schemaId) {
      withHistorySuspended(() => moveTableToSchema(id, patch.schemaId!))
    }
    Object.assign(t, patch)
    scheduleSave()
  }

  function moveTableToSchema(id: string, schemaId: string): void {
    const t = table(id)
    const from = t ? schema(t.schemaId) : undefined
    const to = schema(schemaId)
    if (!t || !from || !to || t.schemaId === schemaId) return
    recordHistory()

    from.tableIds = from.tableIds.filter(x => x !== id)
    if (!to.tableIds.includes(id)) to.tableIds.push(id)
    t.schemaId = schemaId
    scheduleSave()
  }

  function duplicateTable(id: string): TableEntity | undefined {
    const src = table(id)
    const s = src ? schema(src.schemaId) : undefined
    if (!src || !s) return undefined
    recordHistory()

    const newId = createId('table')
    const colIdMap = new Map<string, string>()
    for (const col of src.columns) colIdMap.set(col.id, createId('col'))

    const clonedColumns: Column[] = src.columns.map(col => ({
      ...col,
      id: colIdMap.get(col.id)!,
      ...(col.foreignKey
        ? {
            foreignKey: {
              ...col.foreignKey,
              targetTableId: col.foreignKey.targetTableId === src.id ? newId : col.foreignKey.targetTableId,
              targetColumnId: col.foreignKey.targetTableId === src.id
                ? (colIdMap.get(col.foreignKey.targetColumnId) ?? col.foreignKey.targetColumnId)
                : col.foreignKey.targetColumnId
            }
          }
        : {})
    }))

    const clonedIndexes = src.indexes?.map(idx => ({
      ...idx,
      id: createId('idx'),
      columnNames: [...idx.columnNames]
    }))

    const entity: TableEntity = {
      id: newId,
      schemaId: src.schemaId,
      name: uniqueName(`${src.name}_copy`, tablesOfDatabase(s.dbId).map(t => t.name)),
      gradient: [...src.gradient] as Gradient,
      position: { x: src.position.x + 32, y: src.position.y + 32 },
      ...(src.size ? { size: { ...src.size } } : {}),
      ...(src.comment !== undefined ? { comment: src.comment } : {}),
      columns: clonedColumns,
      ...(clonedIndexes ? { indexes: clonedIndexes } : {})
    }
    workspace.value.tables[newId] = entity
    s.tableIds.push(newId)
    scheduleSave()
    return entity
  }

  function deleteTable(id: string): void {
    const t = table(id)
    if (!t) return
    recordHistory()

    const s = schema(t.schemaId)
    if (s) s.tableIds = s.tableIds.filter(x => x !== id)
    dropKey(workspace.value.tables, id)

    // Strip inbound foreign keys so nothing points at a table that is gone.
    for (const other of Object.values(workspace.value.tables)) {
      for (const col of other.columns) {
        if (col.foreignKey?.targetTableId === id) delete col.foreignKey
      }
    }
    scheduleSave()
  }

  // ---------------------------------------------------------------- columns

  function upsertColumn(tableId: string, column: Column): void {
    const t = table(tableId)
    if (!t) return
    recordHistory()

    // Exclude the column's own id so keeping the same name never turns it into `name_2`,
    // while renaming onto an existing sibling column still de-duplicates safely.
    const otherNames = t.columns.filter(c => c.id !== column.id).map(c => c.name)
    const safeColumn: Column = {
      ...column,
      name: uniqueName(column.name, otherNames)
    }

    const index = t.columns.findIndex(c => c.id === safeColumn.id)
    if (index === -1) t.columns.push(safeColumn)
    else t.columns[index] = safeColumn
    scheduleSave()
  }

  function addColumn(tableId: string, partial?: Partial<Column>): Column | undefined {
    const t = table(tableId)
    if (!t) return undefined
    recordHistory()

    const column: Column = {
      ...partial,
      // These come last: `partial.name` must not defeat the de-duplication.
      id: createId('col'),
      name: uniqueName(partial?.name ?? 'new_column', t.columns.map(c => c.name)),
      type: partial?.type ?? 'VARCHAR',
      isPrimaryKey: partial?.isPrimaryKey ?? false,
      isNullable: partial?.isNullable ?? true,
      isUnique: partial?.isUnique ?? false
    }
    t.columns.push(column)
    scheduleSave()
    return column
  }

  function duplicateColumn(tableId: string, columnId: string): Column | undefined {
    const t = table(tableId)
    const idx = t?.columns.findIndex(c => c.id === columnId) ?? -1
    if (!t || idx === -1) return undefined
    const src = t.columns[idx]!
    recordHistory()

    const copy: Column = {
      ...src,
      id: createId('col'),
      name: uniqueName(`${src.name}_copy`, t.columns.map(c => c.name)),
      isPrimaryKey: false,
      isAutoIncrement: false,
      ...(src.foreignKey ? { foreignKey: { ...src.foreignKey } } : {})
    }
    t.columns.splice(idx + 1, 0, copy)
    scheduleSave()
    return copy
  }

  /**
   * Also clears foreign keys pointing at the deleted column.
   *
   * The React version cleaned up after deleting a *table* but not after
   * deleting a *column*, leaving dangling references (audit REL-8).
   */
  function deleteColumn(tableId: string, columnId: string): void {
    const t = table(tableId)
    if (!t) return
    recordHistory()

    t.columns = t.columns.filter(c => c.id !== columnId)

    for (const other of Object.values(workspace.value.tables)) {
      for (const col of other.columns) {
        if (col.foreignKey?.targetTableId === tableId && col.foreignKey.targetColumnId === columnId) {
          delete col.foreignKey
        }
      }
    }
    scheduleSave()
  }

  // ----------------------------------------------------------- relationships

  /** Mirrors the rules `isValidConnection` enforces on the canvas (audit REL-1). */
  function canRelate(sourceTableId: string, sourceColumnId: string, targetTableId: string, targetColumnId: string): boolean {
    const source = table(sourceTableId)?.columns.find(c => c.id === sourceColumnId)
    const target = table(targetTableId)?.columns.find(c => c.id === targetColumnId)
    if (!source || !target) return false
    if (sourceTableId === targetTableId && sourceColumnId === targetColumnId) return false
    if (source.type !== target.type) return false
    return target.isPrimaryKey || target.isUnique
  }

  function relate(
    sourceTableId: string,
    sourceColumnId: string,
    targetTableId: string,
    targetColumnId: string,
    actions?: { onDelete?: ForeignKeyAction, onUpdate?: ForeignKeyAction }
  ): boolean {
    if (!canRelate(sourceTableId, sourceColumnId, targetTableId, targetColumnId)) return false
    recordHistory()

    const col = table(sourceTableId)!.columns.find(c => c.id === sourceColumnId)!
    col.foreignKey = {
      targetTableId,
      targetColumnId,
      ...(actions?.onDelete ? { onDelete: actions.onDelete } : {}),
      ...(actions?.onUpdate ? { onUpdate: actions.onUpdate } : {})
    }
    scheduleSave()
    return true
  }

  function updateRelation(
    tableId: string,
    columnId: string,
    patch: { onDelete?: ForeignKeyAction, onUpdate?: ForeignKeyAction }
  ): boolean {
    const col = table(tableId)?.columns.find(c => c.id === columnId)
    if (!col?.foreignKey) return false
    recordHistory()

    if ('onDelete' in patch) {
      if (patch.onDelete) col.foreignKey.onDelete = patch.onDelete
      else delete col.foreignKey.onDelete
    }
    if ('onUpdate' in patch) {
      if (patch.onUpdate) col.foreignKey.onUpdate = patch.onUpdate
      else delete col.foreignKey.onUpdate
    }
    scheduleSave()
    return true
  }

  function unrelate(tableId: string, columnId: string): void {
    const col = table(tableId)?.columns.find(c => c.id === columnId)
    if (!col || !col.foreignKey) return
    recordHistory()
    delete col.foreignKey
    scheduleSave()
  }

  // ---------------------------------------------------------------- geometry

  type NodeKind = 'database' | 'schema' | 'table' | 'enum'

  function entityFor(kind: NodeKind, id: string) {
    switch (kind) {
      case 'database': return database(id)
      case 'schema': return schema(id)
      case 'table': return table(id)
      case 'enum': return enumEntity(id)
    }
  }

  /** Persisted for every node kind, not just tables (audit APP-2). */
  function moveNode(kind: NodeKind, id: string, position: XY): void {
    const entity = entityFor(kind, id)
    if (!entity) return
    if (entity.position?.x === position.x && entity.position?.y === position.y) return
    recordHistory()
    entity.position = position
    scheduleSave()
  }

  function moveNodes(updates: Array<{ kind: NodeKind, id: string, position: XY }>): void {
    const pending: Array<{ entity: NonNullable<ReturnType<typeof entityFor>>, position: XY }> = []
    for (const u of updates) {
      const entity = entityFor(u.kind, u.id)
      if (!entity) continue
      if (entity.position?.x === u.position.x && entity.position?.y === u.position.y) continue
      pending.push({ entity, position: u.position })
    }
    if (pending.length === 0) return
    recordHistory()
    for (const item of pending) {
      item.entity.position = item.position
    }
    scheduleSave()
  }

  /** The React version never persisted NodeResizer dimensions (audit APP-3). */
  function resizeNode(kind: NodeKind, id: string, size: WH | undefined): void {
    const entity = entityFor(kind, id)
    if (!entity) return
    if (entity.size?.width === size?.width && entity.size?.height === size?.height) return
    recordHistory()
    entity.size = size
    scheduleSave()
  }

  function nextFreePosition(schemaId: string): XY {
    const taken = tablesOfSchema(schemaId)
    let x = 80
    let y = 80
    for (let i = 0; i < taken.length; i++) {
      x += 380
      if (x > 1100) {
        x = 80
        y += 340
      }
    }
    return { x, y }
  }

  /**
   * Fixed grid reflow, carried over unchanged from the React version.
   * A relationship-aware layout is audit APP-13 and deliberately deferred.
   */
  function autoLayout(schemaId: string): void {
    const tables = tablesOfSchema(schemaId)
    const enums = enumsOfSchema(schemaId)
    if (tables.length === 0 && enums.length === 0) return
    recordHistory()

    const { tablePositions, enumPositions } = computeDagSchemaLayout(
      tables.map(t => ({
        id: t.id,
        name: t.name,
        columns: t.columns,
        width: t.size?.width,
        height: t.size?.height
      })),
      enums.map(e => ({
        id: e.id,
        name: e.name,
        valuesCount: e.values.length,
        width: e.size?.width,
        height: e.size?.height
      }))
    )

    for (const t of tables) {
      const pos = tablePositions[t.id]
      if (pos) t.position = pos
    }
    for (const e of enums) {
      const pos = enumPositions[e.id]
      if (pos) e.position = pos
    }
    scheduleSave()
  }

  // -------------------------------------------------------------- code sync

  /**
   * The only path from parsed code back into the store. Gated behind an
   * explicit Apply in the UI — the React version ran this on a 400 ms debounce
   * while the user was still typing (audit PAR-9).
   */
  function applyCode(dbId: string, parsed: DatabaseProject): void {
    recordHistory()
    workspace.value = reconcileWorkspace(applyParsedProject(workspace.value, dbId, parsed))
    scheduleSave()
  }

  function replaceWorkspace(next: Workspace): void {
    recordHistory()
    workspace.value = reconcileWorkspace(next)
    scheduleSave()
  }

  return {
    workspace,
    hydrated,
    loadSource,
    loadWarning,
    persistenceMode,
    revision,
    resetEpoch,

    canUndo,
    canRedo,
    undo,
    redo,
    clearHistory,

    databases,
    database,
    schema,
    table,
    enumEntity,
    schemasOfDatabase,
    tablesOfSchema,
    enumsOfSchema,
    tablesOfDatabase,
    enumsOfDatabase,
    databaseOfSchema,
    projectFor,
    baselineProjectFor,
    captureBaseline,

    hydrate,
    hydrateDesktopEmpty,
    loadExternalWorkspace,
    flush,

    createDatabase,
    updateDatabase,
    deleteDatabase,

    createSchema,
    updateSchema,
    deleteSchema,

    createEnum,
    updateEnum,
    deleteEnum,

    createTable,
    updateTable,
    duplicateTable,
    deleteTable,
    moveTableToSchema,

    upsertColumn,
    addColumn,
    duplicateColumn,
    deleteColumn,

    canRelate,
    relate,
    updateRelation,
    unrelate,

    moveNode,
    moveNodes,
    resizeNode,
    autoLayout,

    applyCode,
    replaceWorkspace
  }
})

export type { DataType }
