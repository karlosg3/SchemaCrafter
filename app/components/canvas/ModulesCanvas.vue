<script setup lang="ts">
import { VueFlow } from '@vue-flow/core'
import type { Connection, VueFlowStore } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { buildModulesGraph } from '#shared/utils/apiDesign'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

import '@vue-flow/core/dist/style.css'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const apiDialogs = useApiDialogs()
const confirm = useConfirm()
const toast = useToast()

const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.8

const graph = computed(() =>
  ui.activeDbId
    ? buildModulesGraph(workspace.workspace, ui.activeDbId, {
        showUnlinkedTables: ui.state.showUnlinkedTables,
        editable: ui.state.editable
      })
    : { nodes: [], edges: [] }
)

const hoveredNodeId = ref<string | null>(null)
const hoveredEdgeId = ref<string | null>(null)

const nodes = computed(() => graph.value.nodes.map(n => ({
  id: n.id,
  type: n.type,
  position: n.position,
  data: n.data,
  draggable: n.type === 'module' && ui.state.editable,
  selectable: true,
  connectable: ui.state.editable
})))

const hasHover = computed(() => hoveredNodeId.value !== null || hoveredEdgeId.value !== null)

const edges = computed(() => graph.value.edges.map((e) => {
  const highlighted = hoveredEdgeId.value === e.id
    || hoveredNodeId.value === e.source
    || hoveredNodeId.value === e.target
  return {
    id: e.id,
    type: 'relation',
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    data: {
      kind: 'fk' as const,
      label: e.data.label,
      width: e.data.endpointCount > 0 ? 2 : 1.5,
      highlighted,
      dimmed: hasHover.value && !highlighted
    }
  }
}))

const isEmpty = computed(() =>
  ui.activeDbId ? workspace.modulesOfDatabase(ui.activeDbId).length === 0 : true
)

const flow = ref<VueFlowStore | null>(null)
const zoomPercent = computed(() => Math.round((flow.value?.viewport.zoom ?? 1) * 100))

function onPaneReady(instance: VueFlowStore) {
  flow.value = instance
  nextTick(() => instance.fitView({ padding: 0.22, maxZoom: 1 }))
}

function fitAll() {
  flow.value?.fitView({ padding: 0.22, maxZoom: 1, duration: 240 })
}

watch(() => ui.activeDbId, () => {
  nextTick(() => fitAll())
})

watch(() => ui.focusEpoch, () => {
  if (ui.state.workspaceMode !== 'modules' || !ui.focusTargetId || !flow.value) return
  const target = flow.value.findNode(ui.focusTargetId)
  if (!target) return
  flow.value.fitView({ nodes: [target.id], padding: 0.5, maxZoom: 1.1, duration: 260 })
})

function onNodeDragStop({ node }: { node: { id: string, type?: string, position: { x: number, y: number } } }) {
  if (node.type !== 'module') return
  const snap = (v: number) => ui.state.snapToGrid ? Math.round(v / 16) * 16 : Math.round(v)
  workspace.moveModule(node.id, { x: snap(node.position.x), y: snap(node.position.y) })
}

function onConnect(connection: Connection) {
  if (!ui.state.editable) return
  const { source, target } = connection
  if (!source || !target) return

  let moduleId: string | null = null
  let tableId: string | null = null

  if (target.startsWith('entity:') && !source.startsWith('entity:')) {
    moduleId = source
    tableId = target.slice('entity:'.length)
  } else if (source.startsWith('entity:') && !target.startsWith('entity:')) {
    moduleId = target
    tableId = source.slice('entity:'.length)
  }

  if (!moduleId || !tableId) return

  const linked = workspace.linkModuleTable(moduleId, tableId)
  if (linked) {
    const modName = workspace.moduleEntity(moduleId)?.name ?? 'Module'
    const tblName = workspace.table(tableId)?.name ?? 'table'
    toast.add({ title: `Linked ${modName} → ${tblName}`, color: 'success' })
  }
}

async function onEdgeClick({ edge }: { edge: { id: string, source: string, target: string } }) {
  if (!ui.state.editable || !edge.target.startsWith('entity:')) return
  const moduleId = edge.source
  const tableId = edge.target.slice('entity:'.length)
  const mod = workspace.moduleEntity(moduleId)
  const tbl = workspace.table(tableId)
  if (!mod || !tbl) return

  const ok = await confirm({
    title: 'Unlink entity from module?',
    message: `Disconnect "${tbl.name}" from module "${mod.name}"? Endpoints remain intact but lose this table chip.`
  })
  if (!ok) return
  workspace.unlinkModuleTable(moduleId, tableId)
}

async function onAutoLayout() {
  if (!ui.activeDbId) return
  workspace.autoLayoutModules(ui.activeDbId)
  await nextTick()
  fitAll()
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-surface-canvas">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :min-zoom="MIN_ZOOM"
      :max-zoom="MAX_ZOOM"
      :snap-to-grid="ui.state.snapToGrid"
      :snap-grid="[16, 16]"
      :nodes-draggable="ui.state.editable"
      :nodes-connectable="ui.state.editable"
      :delete-key-code="null"
      class="h-full w-full bg-surface-canvas"
      @pane-ready="onPaneReady"
      @node-drag-stop="onNodeDragStop"
      @connect="onConnect"
      @edge-click="onEdgeClick"
      @node-mouse-enter="hoveredNodeId = $event.node.id"
      @node-mouse-leave="hoveredNodeId = hoveredNodeId === $event.node.id ? null : hoveredNodeId"
      @edge-mouse-enter="hoveredEdgeId = $event.edge.id"
      @edge-mouse-leave="hoveredEdgeId = hoveredEdgeId === $event.edge.id ? null : hoveredEdgeId"
    >
      <Background :gap="22" :size="1" pattern-color="var(--color-canvas-dot)" />

      <template #node-module="modProps">
        <ModuleBlockNode
          :data="modProps.data"
          :selected="modProps.selected"
          @edit="apiDialogs.editModule(modProps.data.moduleId)"
          @remove="apiDialogs.removeModule(modProps.data.moduleId)"
          @add-endpoint="ui.activeDbId && apiDialogs.createEndpoint(ui.activeDbId, modProps.data.moduleId)"
          @edit-endpoint="epId => apiDialogs.editEndpoint(epId)"
          @create-table="apiDialogs.createTableFromEndpoint({ moduleId: modProps.data.moduleId })"
          @open-endpoints="ui.openEndpointsForModule(modProps.data.moduleId)"
        />
      </template>

      <template #node-entityRef="entProps">
        <EntityRefNode
          :data="entProps.data"
          :selected="entProps.selected"
          @open-in-db="ui.openTableInDatabase(entProps.data.tableId)"
          @generate-endpoints="apiDialogs.generateEndpointsForTable(entProps.data.tableId)"
          @open-endpoints="ui.openEndpointsForTable(entProps.data.tableId)"
        />
      </template>

      <template #edge-relation="edgeProps">
        <RelationEdge v-bind="edgeProps" />
      </template>
    </VueFlow>

    <!-- Top-left helper strip -->
    <div class="absolute top-3.5 left-3.5 z-10 flex items-center gap-2">
      <div class="sc-panel flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] text-ink-muted">
        <UIcon name="i-ph-cubes" class="size-3.5 text-accent-400" />
        <span class="font-medium text-ink-bright">Modules ↔ Entities Map</span>
        <span class="text-line-panel">·</span>
        <span class="hidden sm:inline text-[11px] text-ink-dim">Drag handles to connect · Click line to unlink</span>
      </div>
    </div>

    <!-- Bottom controls -->
    <div class="absolute bottom-3.5 left-3.5 z-10 flex items-center gap-2 flex-wrap">
      <div class="sc-panel flex items-center gap-1 p-1">
        <UButton
          v-if="ui.state.editable"
          label="New module"
          icon="i-ph-plus"
          size="xs"
          :disabled="!ui.activeDbId"
          @click="ui.activeDbId && apiDialogs.createModule(ui.activeDbId)"
        />
        <UTooltip text="Auto-arrange modules & entities">
          <UButton
            icon="i-ph-flow-arrow"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Auto-arrange modules"
            @click="onAutoLayout"
          />
        </UTooltip>
        <UTooltip :text="ui.state.showUnlinkedTables ? 'Hide unlinked tables' : 'Show all database tables'">
          <UButton
            :icon="ui.state.showUnlinkedTables ? 'i-ph-eye' : 'i-ph-eye-slash'"
            :color="ui.state.showUnlinkedTables ? 'primary' : 'neutral'"
            :variant="ui.state.showUnlinkedTables ? 'soft' : 'ghost'"
            size="xs"
            label="Unlinked"
            @click="ui.toggleDisplay('showUnlinkedTables')"
          />
        </UTooltip>
        <span class="h-4 w-px bg-line-chrome mx-0.5" />
        <UButton
          icon="i-ph-minus"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Zoom out"
          @click="flow?.zoomOut({ duration: 150 })"
        />
        <button
          type="button"
          class="px-1.5 text-[11px] font-mono text-ink-muted hover:text-ink-bright min-w-11"
          @click="fitAll"
        >
          {{ zoomPercent }}%
        </button>
        <UButton
          icon="i-ph-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Zoom in"
          @click="flow?.zoomIn({ duration: 150 })"
        />
        <UButton
          icon="i-ph-corners-out"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Fit view"
          @click="fitAll"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="isEmpty" class="absolute inset-0 grid place-items-center pointer-events-none px-4">
      <div class="pointer-events-auto sc-panel max-w-sm w-full p-6 text-center space-y-4">
        <span class="mx-auto size-11 rounded-lg bg-accent-500/12 border border-accent-500/25 grid place-items-center text-accent-400">
          <UIcon name="i-ph-cubes" class="size-5" />
        </span>
        <div class="space-y-1">
          <h3 class="text-[14px] font-semibold text-ink-bright">
            No API modules in this database
          </h3>
          <p class="text-[12px] text-ink-muted leading-relaxed">
            Create a module to group endpoints and connect them visually to your database tables, or generate endpoints directly from any table in the Database view.
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <UButton
            label="Create module"
            icon="i-ph-plus"
            size="sm"
            :disabled="!ui.activeDbId"
            @click="ui.activeDbId && apiDialogs.createModule(ui.activeDbId)"
          />
          <UButton
            label="Go to Database"
            icon="i-ph-table"
            color="neutral"
            variant="soft"
            size="sm"
            @click="ui.setWorkspaceMode('database')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
