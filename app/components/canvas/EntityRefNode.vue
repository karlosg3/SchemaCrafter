<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { EntityRefNodeData } from '#shared/utils/apiDesign'
import { ENTITY_TARGET_HANDLE } from '#shared/utils/apiDesign'
import { badgeToneClass } from '~/utils/typeBadge'

defineProps<{
  data: EntityRefNodeData
  selected?: boolean
}>()

const emit = defineEmits<{
  openInDb: []
  generateEndpoints: []
  openEndpoints: []
}>()
</script>

<template>
  <div
    class="sc-block bg-[#122744]! [.light_&]:bg-[#F7F1E6]! relative flex flex-col w-62 overflow-visible"
    :class="[
      selected ? 'ring-2 ring-accent-500/75 border-accent-500!' : '',
      data.linkedModuleCount === 0 ? 'border-dashed! opacity-85 hover:opacity-100' : ''
    ]"
  >
    <!-- Left target handle accepting module -> entity links -->
    <Handle
      :id="ENTITY_TARGET_HANDLE"
      type="target"
      :position="Position.Left"
      :connectable="data.editable"
      class="sc-handle opacity-90!"
      style="top: 22px; left: -5px"
    />

    <div
      class="h-[3px] w-full shrink-0 rounded-t-[3px]"
      :style="{ background: `linear-gradient(90deg, ${data.gradient[0]}, ${data.gradient[1]})` }"
    />

    <!-- Header -->
    <div class="group/header flex items-center gap-1.5 h-9 px-2.5 border-b border-line-header bg-surface-raised/45">
      <UIcon name="i-ph-table" class="size-3.5 shrink-0 text-ink-muted" />
      <span class="flex-1 min-w-0 font-mono font-semibold text-[12px] text-ink-bright truncate">
        {{ data.name }}
      </span>
      <span class="shrink-0 rounded border border-line-row bg-surface-chrome px-1.5 py-0.5 font-mono text-[9px] text-ink-dim">
        {{ data.schemaName }}
      </span>
      <UTooltip text="Open table in Database view">
        <UButton
          icon="i-ph-arrow-square-out"
          color="neutral"
          variant="ghost"
          size="xs"
          class="nodrag shrink-0"
          @click.stop="emit('openInDb')"
        />
      </UTooltip>
    </div>

    <!-- Compact key columns preview -->
    <div class="divide-y divide-line-row">
      <div
        v-for="col in data.columns"
        :key="col.id"
        class="flex items-center gap-1.5 px-2.5 h-6 text-[11px]"
      >
        <UIcon
          v-if="col.isPrimaryKey"
          name="i-ph-key"
          class="size-3 shrink-0 text-pk"
        />
        <UIcon
          v-else-if="col.isForeignKey"
          name="i-ph-link-simple"
          class="size-3 shrink-0 text-accent-400 [.light_&]:text-accent-600"
        />
        <span v-else class="size-3 shrink-0" />
        <span class="flex-1 min-w-0 font-mono text-ink truncate">{{ col.name }}</span>
        <span
          class="shrink-0 rounded border px-1 py-0.5 font-mono text-[8.5px] leading-none"
          :class="badgeToneClass(col.type)"
        >
          {{ col.type }}
        </span>
      </div>
      <div
        v-if="data.totalColumnCount > data.columns.length"
        class="px-2.5 py-1 text-[10px] font-mono tabular-nums text-ink-dim"
      >
        +{{ data.totalColumnCount - data.columns.length }} more columns
      </div>
    </div>

    <!-- Footer quick bridge -->
    <div class="flex items-center justify-between gap-2 px-2.5 h-7 border-t border-line-header bg-surface-raised/45 [.light_&]:bg-surface-raised/80 rounded-b-[3px] text-[10px]">
      <button
        v-if="data.endpointCount > 0"
        type="button"
        class="nodrag font-mono tabular-nums text-accent-300 [.light_&]:text-accent-700 hover:underline"
        @click.stop="emit('openEndpoints')"
      >
        {{ data.endpointCount }} {{ data.endpointCount === 1 ? 'endpoint' : 'endpoints' }}
      </button>
      <span v-else class="text-ink-dim font-mono">
        {{ data.linkedModuleCount > 0 ? 'Linked' : 'Unlinked' }}
      </span>

      <button
        v-if="data.editable"
        type="button"
        class="nodrag inline-flex items-center gap-1 text-ink-muted hover:text-ink-bright transition-colors"
        @click.stop="emit('generateEndpoints')"
      >
        <UIcon name="i-ph-sparkle" class="size-3 text-accent-400 [.light_&]:text-accent-600" />
        <span>+ API</span>
      </button>
    </div>
  </div>
</template>
