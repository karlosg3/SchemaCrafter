<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { Connection } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import type { BlockNodeData, BlockRow } from '#shared/utils/graph'
import {
  BLOCK,
  BLOCK_SOURCE_HANDLE,
  BLOCK_TARGET_HANDLE,
  blockHeight,
  rowSourceHandle,
  rowTargetHandle
} from '#shared/utils/graph'

/**
 * The single block primitive from refactor-plan.md:30. Databases, schemas,
 * tables and enums are all this component with different rows — the React app
 * had three near-identical node components instead.
 */
const props = defineProps<{
  data: BlockNodeData
  selected?: boolean
  /** Resizing and the row/header tools are gated on the Editable toggle. */
  editable?: boolean
  /** Column/row IDs that currently have active edges (keeps read-only handles intact). */
  connectedRowIds?: Set<string>
  /**
   * REL-1, applied per handle rather than on <VueFlow>. The flow-level
   * `isValidConnection` is also run against every *declared* edge, so putting
   * the column rules there silently deleted the derived enum, cross-schema and
   * aggregate edges, whose endpoints are block-level handles by design.
   */
  validateConnection?: (connection: Connection) => boolean
}>()

const emit = defineEmits<{
  edit: []
  remove: []
  add: []
  rowClick: [row: BlockRow]
  rowRemove: [row: BlockRow]
  resizeEnd: [size: { width: number, height: number }]
}>()

const naturalHeight = computed(() => blockHeight(props.data))

const style = computed(() => ({
  width: `${props.data.size?.width ?? props.data.width}px`,
  height: `${props.data.size?.height ?? naturalHeight.value}px`
}))

/** Minimum useful size: the header alone, and enough width for a name. */
const MIN = { width: 180, height: BLOCK.headerHeight + BLOCK.borderWidth * 2 }

function onResizeEnd(event: { params: { width: number, height: number } }) {
  emit('resizeEnd', { width: Math.round(event.params.width), height: Math.round(event.params.height) })
}
</script>

<template>
  <div
    class="sc-block flex flex-col overflow-hidden"
    :class="selected ? 'outline-2 outline-accent-500' : ''"
    :style="style"
  >
    <NodeResizer
      v-if="editable"
      :min-width="MIN.width"
      :min-height="MIN.height"
      :color="'transparent'"
      line-class-name="sc-resize-line"
      handle-class-name="sc-resize-handle"
      @resize-end="onResizeEnd"
    />

    <!--
      Block-level handles. Not user-connectable — they exist so the aggregate
      schema edges and the enum/stub edges have something to attach to.
    -->
    <Handle :id="BLOCK_TARGET_HANDLE" type="target" :position="Position.Left" :connectable="false" class="sc-handle-hidden" />
    <Handle :id="BLOCK_SOURCE_HANDLE" type="source" :position="Position.Right" :connectable="false" class="sc-handle-hidden" />

    <!-- Header -->
    <div class="group/header flex items-stretch shrink-0 h-10 border-b border-line-header">
      <span
        class="w-2 shrink-0"
        :style="{ background: `linear-gradient(180deg, ${data.gradient[0]}, ${data.gradient[1]})` }"
      />
      <span class="flex-1 min-w-0 flex items-center px-2.5 font-semibold text-[12.5px] text-ink-bright truncate">
        {{ data.name }}
      </span>
      <span class="flex items-center gap-0.5 px-1.5 shrink-0 invisible group-hover/header:visible group-focus-within/header:visible">
        <UButton
          v-if="editable"
          icon="i-ph-pencil-simple"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Edit ${data.name}`"
          class="nodrag"
          @click.stop="emit('edit')"
        />
        <UTooltip
          v-if="editable"
          :text="data.deleteHint"
          :disabled="!data.deleteHint || data.deletable"
        >
          <UButton
            icon="i-ph-trash"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Delete ${data.name}`"
            :disabled="!data.deletable"
            class="nodrag hover:text-red-400"
            @click.stop="emit('remove')"
          />
        </UTooltip>
      </span>
    </div>

    <!-- Rows -->
    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin nowheel">
      <div
        v-for="row in data.rows"
        :key="row.id"
        class="group/row relative flex items-center gap-2 px-2.5 border-b border-line-row"
        :class="row.action ? 'cursor-pointer hover:bg-white/5' : ''"
        :style="{ height: `${data.rowHeight}px` }"
        @click="row.action && emit('rowClick', row)"
      >
        <!--
          Mount row handles whenever the canvas is editable (for dragging new links)
          or when the column participates in an existing relation edge.
        -->
        <template v-if="row.connectable && (editable || connectedRowIds?.has(row.id))">
          <Handle
            :id="rowTargetHandle(row.id)"
            type="target"
            :position="Position.Left"
            :is-valid-connection="validateConnection"
            class="sc-handle"
          />
          <Handle
            :id="rowSourceHandle(row.id)"
            type="source"
            :position="Position.Right"
            :is-valid-connection="validateConnection"
            class="sc-handle"
          />
        </template>

        <span v-if="row.isPrimaryKey" class="shrink-0 text-[9px] font-bold text-pk">PK</span>

        <span class="flex-1 min-w-0 truncate font-mono text-xs text-ink">{{ row.label }}</span>

        <span
          v-if="row.badge"
          class="shrink-0 font-mono text-[9.5px] px-1.5 py-0.5 bg-white/8 text-ink-muted"
        >{{ row.badge }}</span>

        <span v-if="row.sub" class="shrink-0 text-[10px] text-ink-faint">{{ row.sub }}</span>

        <UTooltip
          v-if="editable && row.deletable !== undefined"
          :text="row.deleteHint"
          :disabled="!row.deleteHint || row.deletable"
        >
          <UButton
            icon="i-ph-trash"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Delete ${row.label}`"
            :disabled="!row.deletable"
            class="nodrag shrink-0 invisible group-hover/row:visible group-focus-within/row:visible hover:text-red-400"
            @click.stop="emit('rowRemove', row)"
          />
        </UTooltip>
      </div>
    </div>

    <!-- Footer -->
    <button
      v-if="data.addLabel && editable"
      type="button"
      class="nodrag shrink-0 h-[34px] w-full flex items-center justify-center gap-1.5
             text-[11.5px] text-accent-400 hover:bg-white/5 transition-colors
             focus-visible:outline-2 focus-visible:outline-accent-500"
      @click.stop="emit('add')"
    >
      + {{ data.addLabel }}
    </button>
  </div>
</template>
