<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()

/**
 * P3 placeholder. The dot grid, the three control islands and the level
 * plumbing are real; Vue Flow and the Block primitive land in P4.
 */
const zoom = ref(1)

function zoomIn() {
  zoom.value = Math.min(1.8, Number((zoom.value + 0.1).toFixed(2)))
}
function zoomOut() {
  zoom.value = Math.max(0.4, Number((zoom.value - 0.1).toFixed(2)))
}
function fitView() {
  zoom.value = 1
}

const pending = computed(() => {
  const dbId = ui.activeDbId
  if (!dbId) return { label: 'No database', count: 0 }

  if (ui.state.viewLevel === 'databases') {
    return { label: 'databases', count: workspace.databases.length }
  }
  if (ui.state.viewLevel === 'schemas') {
    return { label: 'schemas', count: workspace.schemasOfDatabase(dbId).length }
  }
  return ui.activeSchemaId
    ? { label: 'tables', count: workspace.tablesOfSchema(ui.activeSchemaId).length }
    : { label: 'tables', count: workspace.tablesOfDatabase(dbId).length }
})
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden bg-surface-canvas"
    :style="{
      backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
      backgroundSize: `${22 * zoom}px ${22 * zoom}px`
    }"
  >
    <CanvasControls
      :zoom="zoom"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @fit-view="fitView"
    />

    <div class="absolute inset-0 grid place-items-center pointer-events-none">
      <p class="text-ink-faint text-xs font-mono">
        {{ pending.count }} {{ pending.label }} · canvas lands in P4
      </p>
    </div>
  </div>
</template>
