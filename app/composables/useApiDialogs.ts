import type { Component } from 'vue'
import type { Gradient } from '#shared/types/workspace'
import { DEFAULT_GRADIENT } from '#shared/types/workspace'
import { inferTableFromEndpointPath, normalizeBasePath } from '#shared/utils/apiDesign'
import CreateTableFromEndpointModal from '~/components/modals/CreateTableFromEndpointModal.vue'
import type { CreateTableFromEndpointResult } from '~/components/modals/CreateTableFromEndpointModal.vue'
import EndpointModal from '~/components/modals/EndpointModal.vue'
import type { EndpointDraft, EndpointModuleOption } from '~/components/modals/EndpointModal.vue'
import GenerateEndpointsModal from '~/components/modals/GenerateEndpointsModal.vue'
import type { GenerateEndpointsResult } from '~/components/modals/GenerateEndpointsModal.vue'
import ModuleModal from '~/components/modals/ModuleModal.vue'
import type { ModuleDraft, ModuleTableOption } from '~/components/modals/ModuleModal.vue'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

/**
 * Dialog entry points for API Modules, Endpoints, and bidirectional
 * Table <-> Endpoint generation flows.
 */
export function useApiDialogs() {
  const overlay = useOverlay()
  const workspace = useWorkspaceStore()
  const ui = useUiStore()
  const toast = useToast()
  const confirm = useConfirm()

  function openModal<T extends Component>(component: T, props: Record<string, unknown>) {
    return overlay.create(component, { destroyOnClose: true }).open(props as never)
  }

  function tableOptionsForDb(dbId: string): ModuleTableOption[] {
    const schemaNames = new Map(workspace.schemasOfDatabase(dbId).map(s => [s.id, s.name]))
    return workspace.tablesOfDatabase(dbId).map(t => ({
      id: t.id,
      name: t.name,
      schemaName: schemaNames.get(t.schemaId) ?? 'public'
    }))
  }

  function moduleOptionsForDb(dbId: string): EndpointModuleOption[] {
    return workspace.modulesOfDatabase(dbId).map(m => ({
      id: m.id,
      name: m.name,
      basePath: m.basePath
    }))
  }

  // ---------------------------------------------------------------- modules

  async function createModule(dbId: string, initialTableIds: string[] = []) {
    const draft = await openModal(ModuleModal, {
      title: 'New API module',
      submitLabel: 'Create module',
      draft: {
        name: '',
        basePath: '',
        description: '',
        gradient: [...DEFAULT_GRADIENT] as Gradient,
        tableIds: [...initialTableIds]
      },
      tables: tableOptionsForDb(dbId)
    }) as ModuleDraft | null
    if (!draft) return undefined

    const mod = workspace.createModule(dbId, {
      name: draft.name,
      basePath: draft.basePath,
      description: draft.description,
      gradient: draft.gradient,
      tableIds: draft.tableIds
    })
    if (mod) {
      ui.selectedModuleId = mod.id
      toast.add({ title: `Module "${mod.name}" created`, color: 'success' })
    }
    return mod
  }

  async function editModule(moduleId: string) {
    const mod = workspace.moduleEntity(moduleId)
    if (!mod) return

    const draft = await openModal(ModuleModal, {
      title: 'Edit API module',
      submitLabel: 'Save changes',
      draft: {
        name: mod.name,
        basePath: mod.basePath,
        description: mod.description ?? '',
        gradient: [...mod.gradient] as Gradient,
        tableIds: [...mod.tableIds]
      },
      tables: tableOptionsForDb(mod.dbId)
    }) as ModuleDraft | null
    if (!draft) return

    workspace.updateModule(moduleId, {
      name: draft.name,
      basePath: draft.basePath,
      description: draft.description,
      gradient: draft.gradient,
      tableIds: draft.tableIds
    })
  }

  async function removeModule(moduleId: string) {
    const mod = workspace.moduleEntity(moduleId)
    if (!mod) return
    const epCount = mod.endpointIds.length
    const ok = await confirm({
      title: 'Delete module?',
      message: `"${mod.name}" and its ${epCount} ${epCount === 1 ? 'endpoint' : 'endpoints'} will be removed. Linked database tables stay intact.`
    })
    if (!ok) return
    workspace.deleteModule(moduleId)
    if (ui.selectedModuleId === moduleId) ui.selectedModuleId = null
    if (ui.endpointFilterModuleId === moduleId) ui.endpointFilterModuleId = null
  }

  // -------------------------------------------------------------- endpoints

  async function quickCreateTableInline(
    dbId: string,
    routePath: string,
    moduleId?: string
  ): Promise<ModuleTableOption | null> {
    const schemas = workspace.schemasOfDatabase(dbId)
    if (schemas.length === 0) return null
    const defaultSchemaId = (ui.activeSchemaId && schemas.some(s => s.id === ui.activeSchemaId))
      ? ui.activeSchemaId
      : schemas[0]!.id

    const mod = moduleId ? workspace.moduleEntity(moduleId) : undefined
    const inferred = inferTableFromEndpointPath(routePath, workspace.tablesOfDatabase(dbId))

    const result = await openModal(CreateTableFromEndpointModal, {
      sourceLabel: routePath,
      suggestedTableName: inferred.tableName,
      parentFk: inferred.parentFk,
      schemaOptions: schemas.map(s => ({ label: s.name, value: s.id })),
      defaultSchemaId,
      defaultGradient: mod?.gradient,
      allowJumpToDb: false
    }) as CreateTableFromEndpointResult | null
    if (!result) return null

    const created = workspace.createTableFromEndpoint({
      schemaId: result.schemaId,
      name: result.name,
      gradient: result.gradient,
      comment: result.comment,
      parentFk: result.includeParentFk && inferred.parentFk
        ? {
            columnName: inferred.parentFk.columnName,
            targetTableId: inferred.parentFk.targetTableId,
            targetColumnId: inferred.parentFk.targetColumnId
          }
        : null,
      moduleId
    })
    if (!created) return null

    const sch = workspace.schema(created.schemaId)
    toast.add({ title: `Table "${created.name}" created and linked`, color: 'success' })
    return {
      id: created.id,
      name: created.name,
      schemaName: sch?.name ?? 'public'
    }
  }

  async function createEndpoint(dbId: string, defaultModuleId?: string, initialTableIds: string[] = []) {
    let modules = moduleOptionsForDb(dbId)
    let resolvedModuleId = defaultModuleId && modules.some(m => m.id === defaultModuleId)
      ? defaultModuleId
      : modules[0]?.id

    if (!resolvedModuleId) {
      const createdMod = await createModule(dbId, initialTableIds)
      if (!createdMod) return undefined
      modules = moduleOptionsForDb(dbId)
      resolvedModuleId = createdMod.id
    }

    const parentMod = workspace.moduleEntity(resolvedModuleId)
    const defaultPath = normalizeBasePath(parentMod?.basePath ?? '') || '/'
    const presetTables = initialTableIds.length > 0
      ? initialTableIds
      : (parentMod?.tableIds.length === 1 ? [...parentMod.tableIds] : [])

    const draft = await openModal(EndpointModal, {
      title: 'New endpoint',
      submitLabel: 'Create endpoint',
      draft: {
        moduleId: resolvedModuleId,
        method: 'GET',
        path: defaultPath,
        description: '',
        tableIds: presetTables
      },
      modules,
      tables: tableOptionsForDb(dbId),
      onQuickCreateTable: (path: string, modId: string) => quickCreateTableInline(dbId, path, modId)
    }) as EndpointDraft | null
    if (!draft) return undefined

    return workspace.createEndpoint(draft.moduleId, {
      method: draft.method,
      path: draft.path,
      description: draft.description,
      tableIds: draft.tableIds
    })
  }

  async function editEndpoint(endpointId: string) {
    const ep = workspace.endpointEntity(endpointId)
    const mod = ep ? workspace.moduleEntity(ep.moduleId) : undefined
    if (!ep || !mod) return

    const draft = await openModal(EndpointModal, {
      title: 'Edit endpoint',
      submitLabel: 'Save changes',
      draft: {
        moduleId: ep.moduleId,
        method: ep.method,
        path: ep.path,
        description: ep.description,
        tableIds: [...ep.tableIds]
      },
      modules: moduleOptionsForDb(mod.dbId),
      tables: tableOptionsForDb(mod.dbId),
      onQuickCreateTable: (path: string, modId: string) => quickCreateTableInline(mod.dbId, path, modId)
    }) as EndpointDraft | null
    if (!draft) return

    workspace.updateEndpoint(endpointId, {
      moduleId: draft.moduleId,
      method: draft.method,
      path: draft.path,
      description: draft.description,
      tableIds: draft.tableIds
    })
  }

  async function removeEndpoint(endpointId: string) {
    const ep = workspace.endpointEntity(endpointId)
    if (!ep) return
    const ok = await confirm({
      title: 'Delete endpoint?',
      message: `${ep.method} ${ep.path} will be removed. Linked database tables stay intact.`
    })
    if (!ok) return
    workspace.deleteEndpoint(endpointId)
  }

  // ------------------------------------------------ bidirectional generators

  async function generateEndpointsForTable(tableId: string) {
    const tbl = workspace.table(tableId)
    const sch = tbl ? workspace.schema(tbl.schemaId) : undefined
    if (!tbl || !sch) return

    const modules = moduleOptionsForDb(sch.dbId)
    const linkedMod = workspace.modulesOfTable(tableId).find(m => m.dbId === sch.dbId)

    const result = await openModal(GenerateEndpointsModal, {
      tableName: tbl.name,
      schemaName: sch.name,
      tableGradient: [...tbl.gradient] as Gradient,
      modules,
      defaultModuleId: linkedMod?.id
    }) as GenerateEndpointsResult | null
    if (!result) return

    const created = workspace.generateEndpointsForTable(tableId, {
      moduleId: result.moduleId,
      newModule: result.newModule,
      endpoints: result.endpoints
    })
    if (!created) return

    toast.add({
      title: `${created.endpoints.length} ${created.endpoints.length === 1 ? 'endpoint' : 'endpoints'} created`,
      description: `Added to module "${created.module.name}" and linked to ${tbl.name}.`,
      color: 'success'
    })

    if (result.openEndpointsView) {
      ui.openEndpointsForTable(tableId)
    }
  }

  async function createTableFromEndpoint(options: { endpointId?: string, moduleId?: string }) {
    const ep = options.endpointId ? workspace.endpointEntity(options.endpointId) : undefined
    const mod = ep
      ? workspace.moduleEntity(ep.moduleId)
      : (options.moduleId ? workspace.moduleEntity(options.moduleId) : undefined)
    if (!mod) return

    const schemas = workspace.schemasOfDatabase(mod.dbId)
    if (schemas.length === 0) {
      toast.add({ title: 'No schema found in this database', color: 'warning' })
      return
    }

    const defaultSchemaId = (ui.activeSchemaId && schemas.some(s => s.id === ui.activeSchemaId))
      ? ui.activeSchemaId
      : schemas[0]!.id

    const sourcePath = ep ? ep.path : (mod.basePath || `/${mod.name}`)
    const sourceLabel = ep ? `${ep.method} ${ep.path}` : `Module: ${mod.name} (${mod.basePath || '/'})`
    const inferred = inferTableFromEndpointPath(sourcePath, workspace.tablesOfDatabase(mod.dbId))

    const result = await openModal(CreateTableFromEndpointModal, {
      sourceLabel,
      suggestedTableName: inferred.tableName,
      parentFk: inferred.parentFk,
      schemaOptions: schemas.map(s => ({ label: s.name, value: s.id })),
      defaultSchemaId,
      defaultGradient: [...mod.gradient] as Gradient,
      allowJumpToDb: true
    }) as CreateTableFromEndpointResult | null
    if (!result) return

    const created = workspace.createTableFromEndpoint({
      schemaId: result.schemaId,
      name: result.name,
      gradient: result.gradient,
      comment: result.comment,
      parentFk: result.includeParentFk && inferred.parentFk
        ? {
            columnName: inferred.parentFk.columnName,
            targetTableId: inferred.parentFk.targetTableId,
            targetColumnId: inferred.parentFk.targetColumnId
          }
        : null,
      endpointId: ep?.id,
      moduleId: mod.id
    })
    if (!created) return

    toast.add({
      title: `Table "${created.name}" created`,
      description: `Linked to ${ep ? `${ep.method} ${ep.path}` : mod.name}.`,
      color: 'success'
    })

    if (result.openInDatabase) {
      ui.openTableInDatabase(created.id)
    }
  }

  return {
    createModule,
    editModule,
    removeModule,
    createEndpoint,
    editEndpoint,
    removeEndpoint,
    generateEndpointsForTable,
    createTableFromEndpoint
  }
}
