<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { ModuleNodeData } from '#shared/utils/apiDesign'
import { MODULE_NODE_WIDTH, MODULE_SOURCE_HANDLE } from '#shared/utils/apiDesign'
import { HTTP_METHOD_BADGE } from '~/utils/httpMethod'

const props = defineProps<{
  data: ModuleNodeData
  selected?: boolean
}>()

const emit = defineEmits<{
  edit: []
  remove: []
  addEndpoint: []
  editEndpoint: [endpointId: string]
  createTable: []
  openEndpoints: []
}>()

const visibleEndpoints = computed(() => props.data.endpoints.slice(0, 6))
const hiddenCount = computed(() => Math.max(0, props.data.endpoints.length - 6))
</script>

<template>
  <div
    class="sc-block relative flex flex-col overflow-visible"
    :class="selected ? 'ring-2 ring-accent-500/75 border-accent-500!' : ''"
    :style="{ width: `${MODULE_NODE_WIDTH}px` }"
  >
    <!-- Right source handle to drag-connect module -> table -->
    <Handle
      :id="MODULE_SOURCE_HANDLE"
      type="source"
      :position="Position.Right"
      :connectable="data.editable"
      class="sc-handle opacity-90!"
      style="top: 22px; right: -5px"
    />

    <!-- Top gradient accent -->
    <div
      class="h-[3px] w-full shrink-0 rounded-t-[3px]"
      :style="{ background: `linear-gradient(90deg, ${data.gradient[0]}, ${data.gradient[1]})` }"
    />

    <!-- Header -->
    <div class="group/header flex items-center gap-2 h-10 px-2.5 border-b border-line-header bg-surface-raised/85 [.light_&]:bg-surface-raised">
      <UIcon name="i-ph-cubes" class="size-3.5 shrink-0 text-accent-400 [.light_&]:text-accent-600" />
      <span class="flex-1 min-w-0 font-semibold text-[12.5px] text-ink-bright truncate">
        {{ data.name }}
      </span>
      <span
        v-if="data.basePath"
        class="shrink-0 rounded border border-line-panel bg-surface-chrome px-1.5 py-0.5 font-mono text-[9.5px] text-ink-muted max-w-24 truncate"
        :title="data.basePath"
      >
        {{ data.basePath }}
      </span>

      <span class="flex items-center gap-0.5 shrink-0 invisible group-hover/header:visible group-focus-within/header:visible">
        <UTooltip text="View in Endpoints catalog">
          <UButton
            icon="i-ph-list-magnifying-glass"
            color="neutral"
            variant="ghost"
            size="xs"
            class="nodrag"
            @click.stop="emit('openEndpoints')"
          />
        </UTooltip>
        <UButton
          v-if="data.editable"
          icon="i-ph-pencil-simple"
          color="neutral"
          variant="ghost"
          size="xs"
          class="nodrag"
          @click.stop="emit('edit')"
        />
        <UButton
          v-if="data.editable"
          icon="i-ph-trash"
          color="neutral"
          variant="ghost"
          size="xs"
          class="nodrag hover:text-[#EC7484] [.light_&]:hover:text-[#A62C3E]"
          @click.stop="emit('remove')"
        />
      </span>
    </div>

    <!-- Description / metadata bar -->
    <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-line-row bg-surface-raised/35 text-[10.5px] text-ink-dim">
      <span class="truncate">{{ data.description || 'Drag handle to link entities' }}</span>
      <span class="shrink-0 font-mono tabular-nums text-[10px]">
        {{ data.tableCount }} {{ data.tableCount === 1 ? 'tbl' : 'tbls' }}
      </span>
    </div>

    <!-- Endpoints preview list -->
    <div class="divide-y divide-line-row">
      <button
        v-for="ep in visibleEndpoints"
        :key="ep.id"
        type="button"
        class="nodrag w-full flex items-center gap-2 px-2.5 h-7 text-left hover:bg-accent-500/7 transition-colors"
        :title="ep.description || `${ep.method} ${ep.path}`"
        @click.stop="emit('editEndpoint', ep.id)"
      >
        <span
          class="w-12 text-center shrink-0 rounded border px-1 py-0.5 font-mono text-[9px] font-semibold leading-none"
          :class="HTTP_METHOD_BADGE[ep.method]"
        >
          {{ ep.method }}
        </span>
        <span class="flex-1 min-w-0 font-mono text-[11px] text-ink truncate">
          {{ ep.path }}
        </span>
      </button>

      <div
        v-if="data.endpoints.length === 0"
        class="px-2.5 py-3 text-center text-[11px] text-ink-dim"
      >
        No endpoints listed yet
      </div>

      <button
        v-if="hiddenCount > 0"
        type="button"
        class="nodrag w-full px-2.5 py-1 text-center font-mono tabular-nums text-[10.5px] text-accent-300 [.light_&]:text-accent-700 hover:bg-accent-500/10 transition-colors"
        @click.stop="emit('openEndpoints')"
      >
        +{{ hiddenCount }} more — open catalog →
      </button>
    </div>

    <!-- Footer actions -->
    <div
      v-if="data.editable"
      class="flex items-center divide-x divide-line-row border-t border-line-header bg-surface-raised/65 [.light_&]:bg-surface-raised rounded-b-[3px]"
    >
      <button
        type="button"
        class="nodrag flex-1 h-8 flex items-center justify-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink-bright hover:bg-accent-500/8 transition-colors"
        @click.stop="emit('addEndpoint')"
      >
        <UIcon name="i-ph-plus" class="size-3" />
        Endpoint
      </button>
      <button
        type="button"
        class="nodrag flex-1 h-8 flex items-center justify-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink-bright hover:bg-accent-500/8 transition-colors"
        @click.stop="emit('createTable')"
      >
        <UIcon name="i-ph-table" class="size-3" />
        New table
      </button>
    </div>
  </div>
</template>
