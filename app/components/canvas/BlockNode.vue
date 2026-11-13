<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { Connection } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import type { BlockKind, BlockNodeData, BlockRow } from '#shared/utils/graph'
import {
  BLOCK,
  BLOCK_SOURCE_HANDLE,
  BLOCK_TARGET_HANDLE,
  blockHeight,
  rowSourceHandle,
  rowTargetHandle
} from '#shared/utils/graph'

const props = defineProps<{
  data: BlockNodeData
  selected?: boolean
  editable?: boolean
  connectedRowIds?: Set<string>
  validateConnection?: (connection: Connection) => boolean
}>()

const emit = defineEmits<{
  edit: []
  duplicate: []
  remove: []
  add: []
  rowClick: [row: BlockRow]
  rowDuplicate: [row: BlockRow]
  rowRemove: [row: BlockRow]
  resizeEnd: [size: { width: number, height: number }]
  resetSize: []
}>()

const KIND_ICON: Record<BlockKind, string> = {
  database: 'i-ph-database',
  schema: 'i-ph-folders',
  table: 'i-ph-table',
  enum: 'i-ph-list-bullets'
}

const naturalHeight = computed(() => blockHeight(props.data))
const activeHeight = computed(() => props.data.size?.height ?? naturalHeight.value)
const isClipped = computed(() => !!props.data.size && activeHeight.value < naturalHeight.value)

const style = computed(() => ({
  width: `${props.data.size?.width ?? props.data.width}px`,
  height: `${activeHeight.value}px`
}))

const MIN = { width: 180, height: BLOCK.headerHeight + BLOCK.borderWidth * 2 }

function onResizeEnd(event: { params: { width: number, height: number } }) {
  emit('resizeEnd', { width: Math.round(event.params.width), height: Math.round(event.params.height) })
}
</script>

<template>
  <div
    class="sc-block relative flex flex-col overflow-hidden"
    :class="selected ? 'ring-2 ring-accent-500/75 border-accent-500!' : ''"
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

    <Handle :id="BLOCK_TARGET_HANDLE" type="target" :position="Position.Left" :connectable="false" class="sc-handle-hidden" />
    <Handle :id="BLOCK_SOURCE_HANDLE" type="source" :position="Position.Right" :connectable="false" class="sc-handle-hidden" />

    <!-- Top horizontal accent bar -->
    <div
      class="h-[3px] w-full shrink-0"
      :style="{ background: `linear-gradient(90deg, ${data.gradient[0]}, ${data.gradient[1]})` }"
    />

    <!-- Header -->
    <div class="group/header flex items-center gap-2 shrink-0 h-[37px] px-2.5 border-b border-line-header bg-surface-raised/45">
      <UIcon :name="KIND_ICON[data.kind]" class="size-3.5 shrink-0 text-ink-muted" />
      <span
        class="flex-1 min-w-0 font-semibold text-[12.5px] text-ink-bright truncate"
        :class="data.kind === 'database' ? '' : 'font-mono'"
      >
        {{ data.name }}
      </span>
      <UTooltip v-if="data.comment" :text="data.comment">
        <UIcon name="i-ph-note" class="size-3.5 shrink-0 text-ink-faint" />
      </UTooltip>
      <span
        v-if="data.indexCount"
        class="shrink-0 rounded border border-emerald-400/35 bg-emerald-500/12 px-1.5 py-0.5 font-mono text-[9.5px] leading-none text-emerald-300 [.light_&]:text-emerald-700"
        title="Composite indexes"
      >
        {{ data.indexCount }} idx
      </span>
      <span class="flex items-center gap-0.5 shrink-0 invisible group-hover/header:visible group-focus-within/header:visible">
        <UTooltip v-if="editable && data.kind === 'table'" text="Duplicate table">
          <UButton
            icon="i-ph-copy"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Duplicate ${data.name}`"
            class="nodrag"
            @click.stop="emit('duplicate')"
          />
        </UTooltip>
        <UTooltip v-if="editable && data.size" text="Reset card size">
          <UButton
            icon="i-ph-arrows-in-simple"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Reset ${data.name} size`"
            class="nodrag"
            @click.stop="emit('resetSize')"
          />
        </UTooltip>
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
    <div class="relative flex-1 min-h-0 overflow-y-auto scrollbar-thin nowheel">
      <div
        v-for="row in data.rows"
        :key="row.id"
        class="group/row relative flex items-center gap-1.5 px-2.5 border-b border-line-row last:border-b-0 transition-colors"
        :class="row.action ? 'cursor-pointer hover:bg-accent-500/6' : ''"
        :style="{ height: `${data.rowHeight}px` }"
        @click="row.action && emit('rowClick', row)"
      >
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

        <UIcon v-if="row.isPrimaryKey" name="i-ph-key-fill" class="size-3 shrink-0 text-pk" />

        <span class="flex-1 min-w-0 truncate font-mono text-[11.5px] text-ink">
          {{ row.label }}
        </span>

        <UTooltip v-if="row.comment" :text="row.comment">
          <UIcon name="i-ph-chat-text" class="size-3 shrink-0 text-ink-faint" />
        </UTooltip>

        <span
          v-if="row.badge"
          class="shrink-0 rounded border font-mono text-[9.5px] px-1.5 py-0.5 leading-none"
          :class="badgeToneClass(row.badge)"
        >{{ row.badge }}</span>

        <span v-if="row.sub" class="shrink-0 text-[10px] font-mono text-ink-faint whitespace-nowrap">{{ row.sub }}</span>

        <UTooltip
          v-if="editable && row.action?.kind === 'edit' && row.action.target === 'column'"
          text="Duplicate column"
        >
          <UButton
            icon="i-ph-copy"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Duplicate ${row.label}`"
            class="nodrag shrink-0 invisible group-hover/row:visible group-focus-within/row:visible"
            @click.stop="emit('rowDuplicate', row)"
          />
        </UTooltip>

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

      <!-- Bottom overflow fade when card height is manually truncated -->
      <div
        v-if="isClipped"
        class="pointer-events-none sticky bottom-0 inset-x-0 h-5 bg-gradient-to-t from-surface-block to-transparent"
      />
    </div>

    <!-- Footer -->
    <button
      v-if="data.addLabel && editable"
      type="button"
      class="nodrag shrink-0 h-[34px] w-full flex items-center justify-center gap-1.5
             border-t border-line-row text-[11.5px] font-medium
             text-accent-400 hover:bg-accent-500/8 transition-colors
             focus-visible:outline-2 focus-visible:outline-accent-500"
      @click.stop="emit('add')"
    >
      <UIcon name="i-ph-plus" class="size-3" />
      {{ data.addLabel }}
    </button>
  </div>
</template>
