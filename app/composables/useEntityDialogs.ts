import type { Component } from 'vue'
import type { Column, DataType } from '#shared/types/schema'
import { DEFAULT_GRADIENT } from '#shared/types/workspace'
import { slugify } from '#shared/utils/ids'
import { mergeImportedSql } from '#shared/utils/importSql'
import ColumnModal from '~/components/modals/ColumnModal.vue'
import type { ColumnDraft, FkTableOption } from '~/components/modals/ColumnModal.vue'
import EntityModal from '~/components/modals/EntityModal.vue'
import type { EntityDraft } from '~/components/modals/EntityModal.vue'
import EnumModal from '~/components/modals/EnumModal.vue'
import type { EnumDraft } from '~/components/modals/EnumModal.vue'
import ImportSqlModal from '~/components/modals/ImportSqlModal.vue'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

export type EntityKind = 'database' | 'schema' | 'table' | 'enum'

/**
 * Every create/edit/delete entry point in the app.
 *
 * The sidebar, the canvas blocks and the navbar all reach for the same seven
 * forms, so they live here rather than being wired three times through emits.
 * This replaces the React app's seven `useState` modal slices and the
 * `confirmModalData.onConfirm` closure it carried in app state (App.tsx:106) —
 * `useOverlay()` returns a promise, so a delete is `if (await confirm(...))`.
 */
export function useEntityDialogs() {
  const overlay = useOverlay()
  const workspace = useWorkspaceStore()
  const ui = useUiStore()
  const toast = useToast()
  const confirm = useConfirm()

  /**
   * One overlay per open, with `destroyOnClose` so it unregisters itself on the
   * way out. A cached instance would keep the component mounted between opens
   * and carry the previous entity's draft into the next form.
   */
  function openModal<T extends Component>(component: T, props: Record<string, unknown>) {
    return overlay.create(component, { destroyOnClose: true }).open(props as never)
  }

  // ------------------------------------------------------------- databases

  async function createDatabase() {
    const draft = await openModal(EntityModal, {
      kind: 'database',
      title: 'New database',
      submitLabel: 'Create',
      draft: { name: '', gradient: [...DEFAULT_GRADIENT], comment: '', engine: 'postgresql' }
    }) as EntityDraft | null
    if (!draft) return

    const db = workspace.createDatabase(draft.name.trim(), draft.engine ?? 'postgresql')
    workspace.updateDatabase(db.id, {
      gradient: draft.gradient,
      ...(draft.comment.trim() ? { comment: draft.comment.trim() } : {})
    })
    ui.selectDatabase(db.id)
  }

  async function editDatabase(id: string) {
    const db = workspace.database(id)
    if (!db) return

    const draft = await openModal(EntityModal, {
      kind: 'database',
      title: 'Edit database',
      submitLabel: 'Save',
      draft: { name: db.name, gradient: [...db.gradient], comment: db.comment ?? '', engine: db.engine }
    }) as EntityDraft | null
    if (!draft) return

    // Takes the id it was opened for, not whichever database is active (APP-1).
    workspace.updateDatabase(id, {
      name: draft.name.trim(),
      engine: draft.engine,
      gradient: draft.gradient,
      comment: draft.comment.trim() || undefined
    })
  }

  // --------------------------------------------------------------- schemas

  async function createSchema(dbId: string) {
    const draft = await openModal(EntityModal, {
      kind: 'schema',
      title: 'New schema',
      submitLabel: 'Create',
      draft: { name: '', gradient: [...DEFAULT_GRADIENT], comment: '' }
    }) as EntityDraft | null
    if (!draft) return

    const schema = workspace.createSchema(dbId, slugify(draft.name), draft.gradient, draft.comment.trim() || undefined)
    if (schema) ui.selectSchema(schema.id)
  }

  async function editSchema(id: string) {
    const schema = workspace.schema(id)
    if (!schema) return

    const draft = await openModal(EntityModal, {
      kind: 'schema',
      title: 'Edit schema',
      submitLabel: 'Save',
      draft: { name: schema.name, gradient: [...schema.gradient], comment: schema.comment ?? '' }
    }) as EntityDraft | null
    if (!draft) return

    workspace.updateSchema(id, {
      name: slugify(draft.name),
      gradient: draft.gradient,
      comment: draft.comment.trim() || undefined
    })
  }

  // ---------------------------------------------------------------- tables

  function schemaOptions(dbId: string) {
    return workspace.schemasOfDatabase(dbId).map(s => ({ label: s.name, value: s.id }))
  }

  async function createTable(schemaId: string) {
    const schema = workspace.schema(schemaId)
    if (!schema) return

    const draft = await openModal(EntityModal, {
      kind: 'table',
      title: 'New table',
      submitLabel: 'Create',
      draft: { name: '', gradient: [...DEFAULT_GRADIENT], comment: '', schemaId },
      schemaOptions: schemaOptions(schema.dbId)
    }) as EntityDraft | null
    if (!draft) return

    const table = workspace.createTable(draft.schemaId ?? schemaId, slugify(draft.name))
    if (table) {
      workspace.updateTable(table.id, {
        gradient: draft.gradient,
        comment: draft.comment.trim() || undefined
      })
    }
  }

  async function editTable(id: string) {
    const table = workspace.table(id)
    const schema = table ? workspace.schema(table.schemaId) : undefined
    if (!table || !schema) return

    const draft = await openModal(EntityModal, {
      kind: 'table',
      title: 'Edit table',
      submitLabel: 'Save',
      draft: {
        name: table.name,
        gradient: [...table.gradient],
        comment: table.comment ?? '',
        schemaId: table.schemaId
      },
      schemaOptions: schemaOptions(schema.dbId)
    }) as EntityDraft | null
    if (!draft) return

    workspace.updateTable(id, {
      name: slugify(draft.name),
      gradient: draft.gradient,
      schemaId: draft.schemaId,
      comment: draft.comment.trim() || undefined
    })
  }

  // ----------------------------------------------------------------- enums

  async function createEnum(schemaId: string) {
    const draft = await openModal(EnumModal, {
      title: 'New enum',
      submitLabel: 'Create',
      draft: { name: '', values: [''] }
    }) as EnumDraft | null
    if (!draft) return

    workspace.createEnum(schemaId, enumName(draft.name), draft.values)
  }

  async function editEnum(id: string) {
    const entity = workspace.enumEntity(id)
    if (!entity) return

    const draft = await openModal(EnumModal, {
      title: 'Edit enum',
      submitLabel: 'Save',
      draft: { name: entity.name, values: [...entity.values] }
    }) as EnumDraft | null
    if (!draft) return

    workspace.updateEnum(id, { name: enumName(draft.name), values: draft.values })
  }

  /** Enum names keep their casing — they become type names, not identifiers. */
  function enumName(raw: string): string {
    return raw.trim().replace(/\s+/g, '_')
  }

  // --------------------------------------------------------------- columns

  const NEW_COLUMN: ColumnDraft = {
    name: '',
    type: 'VARCHAR' as DataType,
    isPrimaryKey: false,
    isNullable: true,
    isUnique: false,
    isIndexed: false,
    isAutoIncrement: false
  }

  async function editColumn(tableId: string, columnId?: string) {
    const table = workspace.table(tableId)
    const schema = table ? workspace.schema(table.schemaId) : undefined
    if (!table || !schema) return

    const existing = columnId ? table.columns.find(c => c.id === columnId) : undefined

    const fkTables: FkTableOption[] = workspace
      .tablesOfDatabase(schema.dbId)
      .filter(t => t.id !== tableId)
      .map(t => ({
        id: t.id,
        name: t.name,
        columns: t.columns.map(c => ({ id: c.id, name: c.name, type: c.type }))
      }))

    const draft = await openModal(ColumnModal, {
      title: existing ? 'Edit column' : 'New column',
      submitLabel: existing ? 'Save' : 'Create',
      draft: existing ? stripId(existing) : { ...NEW_COLUMN },
      tables: fkTables,
      // Resolved within the owning schema: two schemas may hold same-named enums.
      enums: workspace.enumsOfSchema(schema.id).map(e => ({ name: e.name, values: e.values }))
    }) as ColumnDraft | null
    if (!draft) return

    const next = { ...draft, name: slugify(draft.name) }
    if (existing) workspace.upsertColumn(tableId, { ...next, id: existing.id } satisfies Column)
    // addColumn re-runs the name through uniqueName, which upsert deliberately
    // does not — renaming a column to itself must not turn it into `name_2`.
    else workspace.addColumn(tableId, next)
  }

  function stripId(column: Column): ColumnDraft {
    const { id: _id, ...rest } = column
    return { ...rest, isIndexed: rest.isIndexed ?? false, isAutoIncrement: rest.isAutoIncrement ?? false }
  }

  // ---------------------------------------------------------------- import

  async function importSql(dbId: string) {
    const project = workspace.projectFor(dbId)
    const sql = await openModal(ImportSqlModal, { project }) as string | null
    if (!sql) return

    try {
      const { project: merged, added, updated } = mergeImportedSql(project, sql)
      workspace.applyCode(dbId, merged)
      toast.add({
        title: 'SQL imported',
        description: `${added.length} table${added.length === 1 ? '' : 's'} added, ${updated.length} updated.`,
        color: 'success'
      })
    } catch (error) {
      toast.add({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'The SQL could not be parsed.',
        color: 'error'
      })
    }
  }

  // ---------------------------------------------------------------- delete

  async function remove(kind: EntityKind, id: string) {
    const name = displayName(kind, id)
    if (name === null) return

    if (!await confirm({
      title: `Delete ${kind}?`,
      message: deleteMessage(kind, name)
    })) return

    if (kind === 'database') workspace.deleteDatabase(id)
    else if (kind === 'schema') workspace.deleteSchema(id)
    else if (kind === 'table') workspace.deleteTable(id)
    else workspace.deleteEnum(id)
  }

  async function removeColumn(tableId: string, columnId: string) {
    const column = workspace.table(tableId)?.columns.find(c => c.id === columnId)
    if (!column) return

    if (!await confirm({
      title: 'Delete column?',
      message: `"${column.name}" and any foreign key pointing at it will be removed.`
    })) return

    workspace.deleteColumn(tableId, columnId)
  }

  function displayName(kind: EntityKind, id: string): string | null {
    if (kind === 'database') return workspace.database(id)?.name ?? null
    if (kind === 'schema') return workspace.schema(id)?.name ?? null
    if (kind === 'table') return workspace.table(id)?.name ?? null
    return workspace.enumEntity(id)?.name ?? null
  }

  function deleteMessage(kind: EntityKind, name: string): string {
    if (kind === 'database') return `"${name}" and every schema, table and enum inside it will be removed. This cannot be undone.`
    if (kind === 'schema') return `"${name}" will be removed. Any tables still in it move to the database's public schema.`
    if (kind === 'table') return `"${name}" and every foreign key pointing at it will be removed. This cannot be undone.`
    return `"${name}" will be removed. Columns using it keep the type name but lose the enum.`
  }

  // --------------------------------------------------------------- routing

  /** The canvas and the sidebar both address entities as (kind, id). */
  function edit(kind: EntityKind, id: string) {
    if (kind === 'database') return editDatabase(id)
    if (kind === 'schema') return editSchema(id)
    if (kind === 'table') return editTable(id)
    return editEnum(id)
  }

  return {
    createDatabase,
    editDatabase,
    createSchema,
    editSchema,
    createTable,
    editTable,
    createEnum,
    editEnum,
    editColumn,
    importSql,
    remove,
    removeColumn,
    edit
  }
}
