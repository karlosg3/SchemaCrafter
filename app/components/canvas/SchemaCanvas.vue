<script setup lang="ts">
import { VueFlow } from '@vue-flow/core'
import type { Connection, VueFlowStore } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import type { BlockNodeData, BlockRow, GraphNode, StubNodeData } from '#shared/utils/graph'
import { buildGraph, columnIdFromHandle } from '#shared/utils/graph'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const toast = useToast()
const confirm = useConfirm()
const dialogs = useEntityDialogs()

/** Prototype zoom clamps. */
const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.8

// -------------------------------------------------------------------- graph

const graph = computed(() => buildGraph(workspace.workspace, {
  level: ui.state.viewLevel,
  dbId: ui.activeDbId,
  schemaId: ui.activeSchemaId,
  showRelations: ui.state.showRelations,
  showEnums: ui.state.showEnums,
  showTypes: ui.state.showTypes,
  editable: ui.state.editable
}))

/**
 * Bound as a plain prop, not v-model. Vue Flow keeps its own copy and we write
 * back only from drag-stop and resize-end, which is what stops the derived
 * nodes and the store from chasing each other (see the plan's Risk 1).
 */
const nodes = computed(() => graph.value.nodes.map(n => ({
  id: n.id,
  type: n.type,
  position: n.position,
  data: n.data,
  draggable: n.type === 'block',
  selectable: n.type === 'block',
  connectable: n.type === 'block' && ui.state.editable
})))

const hoveredNodeId = ref<string | null>(null)
const hoveredEdgeId = ref<string | null>(null)
const selectedNodeIds = ref<Set<string>>(new Set())

const connectedRowIds = computed(() => {
  const ids = new Set<string>()
  for (const e of graph.value.edges) {
    const sourceCol = columnIdFromHandle(e.sourceHandle)
    if (sourceCol) ids.add(sourceCol)
    const targetCol = columnIdFromHandle(e.targetHandle)
    if (targetCol) ids.add(targetCol)
  }
  return ids
})

function isEdgeHighlighted(edge: { id: string, source: string, target: string }): boolean {
  if (hoveredEdgeId.value === edge.id) return true
  if (hoveredNodeId.value === edge.source || hoveredNodeId.value === edge.target) return true
  return selectedNodeIds.value.has(edge.source) || selectedNodeIds.value.has(edge.target)
}

const hasActiveFocus = computed(() =>
  hoveredEdgeId.value !== null || hoveredNodeId.value !== null || selectedNodeIds.value.size > 0
)

const edges = computed(() => graph.value.edges.map((e) => {
  const highlighted = isEdgeHighlighted(e)
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: 'relation',
    animated: e.data.kind === 'fk' && highlighted,
    data: {
      ...e.data,
      highlighted,
      dimmed: hasActiveFocus.value && !highlighted
    }
  }
}))

const isEmpty = computed(() => graph.value.nodes.length === 0)

const nodeMap = computed(() => new Map(graph.value.nodes.map(n => [n.id, n])))
const nodeById = (id: string): GraphNode | undefined => nodeMap.value.get(id)

// -------------------------------------------------------------------- camera

/**
 * fitViewOnInit would honour maxZoom and blow a single small block up to 180%,
 * so the fit is driven by hand with its own cap. Re-fitting on every level
 * change is what makes drilling feel like navigation rather than teleporting.
 */
let flow: VueFlowStore | null = null

/**
 * Fitting has to wait for the new blocks to be measured, so a level change only
 * arms the request; `onNodesInitialized` fires it. Refitting on that hook
 * unconditionally would also yank the viewport every time a column is added.
 */
let pendingFit = false
let pendingFocusId: string | null = null
let stopSelectionWatch: (() => void) | null = null

function fit() {
  pendingFit = false
  flow?.fitView({ padding: 0.2, maxZoom: 1 })
}

function focusNode(id: string) {
  if (!flow || !nodeById(id)) return false
  flow.fitView({ nodes: [id], padding: 0.45, maxZoom: 1.05, duration: 260 })
  return true
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable || !!target.closest('.cm-editor')
}

function onWindowKeyDown(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return

  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === '0') {
    event.preventDefault()
    fit()
    return
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (!ui.state.editable || selectedNodeIds.value.size !== 1) return
    const [selectedId] = Array.from(selectedNodeIds.value)
    const node = selectedId ? nodeById(selectedId) : undefined
    if (!node || node.type !== 'block' || !node.data.deletable) return
    event.preventDefault()
    dialogs.remove(node.data.kind, node.id)
  }
}

function onPaneReady(instance: VueFlowStore) {
  flow = instance
  stopSelectionWatch?.()
  stopSelectionWatch = watch(
    instance.getSelectedNodes,
    (selected) => {
      selectedNodeIds.value = new Set(selected.map(n => n.id))
    },
    { immediate: true }
  )
  instance.onNodesInitialized(() => {
    if (pendingFocusId && focusNode(pendingFocusId)) {
      pendingFocusId = null
      pendingFit = false
      return
    }
    if (pendingFit) fit()
  })
  fit()
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
  stopSelectionWatch?.()
  stopSelectionWatch = null
})

watch(
  () => [ui.state.viewLevel, ui.activeDbId, ui.activeSchemaId].join('|'),
  () => { pendingFit = true }
)

watch(
  () => ui.focusEpoch,
  async () => {
    const id = ui.focusTargetId
    if (!id) return
    pendingFocusId = id
    await nextTick()
    if (!pendingFit && focusNode(id)) pendingFocusId = null
  }
)

// ------------------------------------------------------------------ geometry

/**
 * Positions are written on drag-stop only, never on every `nodes-change`.
 * Persisting all four node kinds rather than just tables is audit APP-2.
 */
function onNodeDragStop({ nodes: dragged }: { nodes: { id: string, position: { x: number, y: number } }[] }) {
  for (const node of dragged) {
    const graphNode = nodeById(node.id)
    // Stubs are derived from their source row and have nothing to persist.
    if (!graphNode || graphNode.type !== 'block') continue
    workspace.moveNode(graphNode.data.kind, node.id, {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y)
    })
  }
}

/** The React app dropped NodeResizer's dimensions on the floor (audit APP-3). */
function onResizeEnd(node: GraphNode, size: { width: number, height: number }) {
  if (node.type !== 'block') return
  workspace.resizeNode(node.data.kind, node.id, size)
}

function onResetSize(node: GraphNode) {
  if (node.type !== 'block') return
  workspace.resizeNode(node.data.kind, node.id, undefined)
}

// --------------------------------------------------------------- connections

/**
 * The three rules from audit REL-1 at once: both ends must be column handles,
 * the types must match, and the target must be a key. Dropping onto an enum or
 * a stub fails the first rule, since neither exposes a column handle.
 *
 * Passed down to the column handles rather than to <VueFlow>. Vue Flow runs a
 * flow-level `isValidConnection` over every *declared* edge as well as over
 * user drags, so the derived enum, cross-schema and aggregate edges — which
 * legitimately end on block-level handles — were being dropped on render.
 */
function isValidConnection(connection: Connection): boolean {
  const sourceColumnId = columnIdFromHandle(connection.sourceHandle)
  const targetColumnId = columnIdFromHandle(connection.targetHandle)
  if (!sourceColumnId || !targetColumnId) return false
  return workspace.canRelate(connection.source, sourceColumnId, connection.target, targetColumnId)
}

function onConnect(connection: Connection) {
  const sourceColumnId = columnIdFromHandle(connection.sourceHandle)
  const targetColumnId = columnIdFromHandle(connection.targetHandle)
  if (!sourceColumnId || !targetColumnId) return

  const ok = workspace.relate(connection.source, sourceColumnId, connection.target, targetColumnId)
  if (!ok) {
    toast.add({
      title: 'Relation rejected',
      description: 'Both columns must share a type, and the target must be a primary or unique key.',
      color: 'warning'
    })
  }
}

// ------------------------------------------------------------------ commands

function onNodeDoubleClick({ node }: { node: { id: string } }) {
  const graphNode = nodeById(node.id)
  if (graphNode?.type !== 'block' || !graphNode.data.drillTo) return
  ui.drillInto(graphNode.data.drillTo.level, graphNode.data.drillTo.id)
}

function onStubActivate(data: StubNodeData) {
  if (data.schemaId) ui.drillInto('tables', data.schemaId)
}

function onRowClick(node: GraphNode, row: BlockRow) {
  if (!row.action || node.type !== 'block') return
  if (row.action.kind === 'drill') {
    ui.drillInto(row.action.level, row.action.id)
  } else if (row.action.target === 'column') {
    dialogs.editColumn(node.id, row.action.id)
  } else {
    dialogs.edit(row.action.target, row.action.id)
  }
}

/** The footer button means "add one of whatever this block lists". */
function onAdd(id: string, data: BlockNodeData) {
  if (data.kind === 'database') dialogs.createSchema(id)
  else if (data.kind === 'schema') dialogs.createTable(id)
  else if (data.kind === 'table') dialogs.editColumn(id)
  // Values have no identity of their own, so they are edited on the enum.
  else dialogs.editEnum(id)
}

function onRemove(id: string, data: BlockNodeData) {
  dialogs.remove(data.kind, id)
}

async function onRowRemove(node: GraphNode, row: BlockRow) {
  if (node.type !== 'block') return

  // A row means a different thing at every level, so the block decides.
  if (node.data.kind === 'database') return dialogs.remove('schema', row.id)
  if (node.data.kind === 'schema') return dialogs.remove('table', row.id)
  if (node.data.kind === 'table') return dialogs.removeColumn(node.id, row.id)

  const entity = workspace.enumEntity(node.id)
  if (!entity) return
  if (!await confirm({ title: 'Remove value?', message: `"${row.label}" will be removed from ${entity.name}.` })) return
  workspace.updateEnum(node.id, { values: entity.values.filter(v => v !== row.label) })
}
const emptyStateMeta = computed(() => {
  if (ui.state.viewLevel === 'databases') {
    return {
      icon: 'i-ph-database',
      title: 'No databases in this workspace',
      description: 'Create your first database to begin modeling schemas and tables.',
      actionLabel: 'Create database',
      onPrimary: () => dialogs.createDatabase(),
      canImportSql: false
    }
  }
  if (ui.state.viewLevel === 'schemas') {
    return {
      icon: 'i-ph-folders',
      title: 'No schemas in this database',
      description: 'Organize tables and enums under one or more schemas.',
      actionLabel: 'Create schema',
      onPrimary: () => ui.activeDbId && dialogs.createSchema(ui.activeDbId),
      canImportSql: false
    }
  }
  return {
    icon: 'i-ph-table',
    title: 'This schema is empty',
    description: 'Add a table manually or import existing CREATE TABLE SQL statements.',
    actionLabel: 'Create table',
    onPrimary: () => ui.activeSchemaId && dialogs.createTable(ui.activeSchemaId),
    canImportSql: !!ui.activeDbId
  }
})
</script>

<template>
  <VueFlow
    :nodes="nodes"
    :edges="edges"
    :min-zoom="MIN_ZOOM"
    :max-zoom="MAX_ZOOM"
    :nodes-draggable="ui.state.editable"
    :nodes-connectable="ui.state.editable"
    :elements-selectable="true"
    :delete-key-code="null"
    class="h-full w-full bg-surface-canvas"
    @pane-ready="onPaneReady"
    @node-drag-stop="onNodeDragStop"
    @node-double-click="onNodeDoubleClick"
    @node-mouse-enter="hoveredNodeId = $event.node.id"
    @node-mouse-leave="hoveredNodeId = hoveredNodeId === $event.node.id ? null : hoveredNodeId"
    @edge-mouse-enter="hoveredEdgeId = $event.edge.id"
    @edge-mouse-leave="hoveredEdgeId = hoveredEdgeId === $event.edge.id ? null : hoveredEdgeId"
    @connect="onConnect"
  >
    <Background :gap="22" :size="1" pattern-color="var(--color-canvas-dot)" />

    <template #node-block="blockProps">
      <BlockNode
        :data="blockProps.data"
        :selected="blockProps.selected"
        :editable="ui.state.editable"
        :connected-row-ids="connectedRowIds"
        :validate-connection="isValidConnection"
        @edit="dialogs.edit(blockProps.data.kind, blockProps.id)"
        @remove="onRemove(blockProps.id, blockProps.data)"
        @add="onAdd(blockProps.id, blockProps.data)"
        @row-click="row => onRowClick(nodeById(blockProps.id)!, row)"
        @row-remove="row => onRowRemove(nodeById(blockProps.id)!, row)"
        @resize-end="size => onResizeEnd(nodeById(blockProps.id)!, size)"
        @reset-size="onResetSize(nodeById(blockProps.id)!)"
      />
    </template>

    <template #node-stub="stubProps">
      <StubNode :data="stubProps.data" @activate="onStubActivate(stubProps.data)" />
    </template>

    <template #edge-relation="edgeProps">
      <RelationEdge v-bind="edgeProps" />
    </template>

    <CanvasControls />

    <div v-if="isEmpty" class="absolute inset-0 grid place-items-center pointer-events-none px-4">
      <div class="pointer-events-auto sc-panel max-w-sm w-full p-6 text-center space-y-4">
        <span class="mx-auto size-11 rounded-xl bg-accent-500/12 border border-accent-500/25 grid place-items-center text-accent-400">
          <UIcon :name="emptyStateMeta.icon" class="size-5" />
        </span>
        <div class="space-y-1">
          <h3 class="text-[14px] font-semibold text-ink-bright">
            {{ emptyStateMeta.title }}
          </h3>
          <p class="text-[12px] text-ink-muted leading-relaxed">
            {{ emptyStateMeta.description }}
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <UButton
            :label="emptyStateMeta.actionLabel"
            icon="i-ph-plus"
            size="sm"
            :disabled="!ui.state.editable"
            @click="emptyStateMeta.onPrimary()"
          />
          <UButton
            v-if="emptyStateMeta.canImportSql"
            label="Import SQL"
            icon="i-ph-upload-simple"
            color="neutral"
            variant="outline"
            size="sm"
            @click="ui.activeDbId && dialogs.importSql(ui.activeDbId)"
          />
        </div>
      </div>
    </div>
  </VueFlow>
</template>
