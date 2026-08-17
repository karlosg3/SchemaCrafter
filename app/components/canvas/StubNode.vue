<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { StubNodeData } from '#shared/utils/graph'
import { BLOCK_TARGET_HANDLE } from '#shared/utils/graph'

/**
 * The far end of a cross-schema foreign key.
 *
 * The referenced table is not on this canvas, so the prototype drew a stubbed
 * line with a `schema.table` label. Here that label is a real node, which makes
 * it clickable: it drills into the schema the reference points at.
 */
defineProps<{ data: StubNodeData }>()

const emit = defineEmits<{ activate: [] }>()
</script>

<template>
  <button
    type="button"
    class="nodrag flex items-center gap-1.5 px-2 h-6 border-2 border-dashed border-line-dashed
           bg-surface-canvas font-mono text-[10px] text-ink-muted whitespace-nowrap
           hover:text-ink-bright hover:border-line-panel transition-colors
           focus-visible:outline-2 focus-visible:outline-accent-500"
    :aria-label="`Go to ${data.label}`"
    @click="emit('activate')"
  >
    <Handle :id="BLOCK_TARGET_HANDLE" type="target" :position="Position.Left" :connectable="false" class="sc-handle-hidden" />
    <UIcon name="i-ph-arrow-square-out" class="size-3 shrink-0" />
    {{ data.label }}
  </button>
</template>
