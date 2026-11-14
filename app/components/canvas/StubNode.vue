<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { StubNodeData } from '#shared/utils/graph'
import { BLOCK_TARGET_HANDLE } from '#shared/utils/graph'

defineProps<{ data: StubNodeData }>()

const emit = defineEmits<{ activate: [] }>()
</script>

<template>
  <button
    type="button"
    class="nodrag flex items-center gap-1.5 px-2.5 h-6 rounded-md border border-dashed border-line-dashed
           bg-surface-block/90 backdrop-blur-sm shadow-xs font-mono text-[10px] text-ink-muted whitespace-nowrap
           hover:text-ink-bright hover:border-accent-400/60 transition-colors
           focus-visible:outline-2 focus-visible:outline-accent-500"
    :aria-label="`Go to ${data.label}`"
    @click="emit('activate')"
  >
    <Handle :id="BLOCK_TARGET_HANDLE" type="target" :position="Position.Left" :connectable="false" class="sc-handle-hidden" />
    <UIcon name="i-ph-arrow-square-out" class="size-3 shrink-0 text-accent-400" />
    {{ data.label }}
  </button>
</template>
