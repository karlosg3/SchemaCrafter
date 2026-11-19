<script setup lang="ts">
import { useVueFlow } from '@vue-flow/core'
import type { ViewLevel } from '~/stores/ui'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const { zoomIn, zoomOut, fitView, viewport } = useVueFlow()

const LEVELS: { level: ViewLevel, label: string, icon: string }[] = [
  { level: 'databases', label: 'Databases', icon: 'i-ph-database' },
  { level: 'schemas', label: 'Schemas', icon: 'i-ph-folders' },
  { level: 'tables', label: 'Tables', icon: 'i-ph-table' }
]

const DISPLAY = [
  { key: 'showRelations', label: 'Show relations', icon: 'i-ph-git-branch' },
  { key: 'showEnums', label: 'Show enums', icon: 'i-ph-list-bullets' },
  { key: 'showTypes', label: 'Show types', icon: 'i-ph-tag' },
  { key: 'snapToGrid', label: 'Snap to grid (16px)', icon: 'i-ph-grid-four' },
  { key: 'showMinimap', label: 'Show minimap', icon: 'i-ph-map-trifold' },
  { key: 'editable', label: 'Editable', icon: 'i-ph-pencil-simple' }
] as const

const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)

function onFitView() {
  fitView({ padding: 0.2, maxZoom: 1 })
}

async function onAutoLayout() {
  if (!ui.activeSchemaId) return
  workspace.autoLayout(ui.activeSchemaId)
  await nextTick()
  onFitView()
}
</script>

<template>
  <!-- Top left: view switch + breadcrumb -->
  <div class="absolute top-4 left-4 z-10 flex flex-col gap-2 items-start">
    <div class="sc-panel flex items-center gap-0.5 p-1">
      <button
        v-for="item in LEVELS"
        :key="item.level"
        type="button"
        class="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11.5px] font-medium transition-colors
               focus-visible:outline-2 focus-visible:outline-accent-500"
        :class="ui.state.viewLevel === item.level
          ? 'bg-accent-500/20 text-accent-300 border-accent-500/45 [.light_&]:bg-surface-block [.light_&]:text-accent-700 [.light_&]:border-accent-600/35 [.light_&]:shadow-2xs'
          : 'border-transparent text-ink-muted hover:text-ink-bright hover:bg-surface-raised/60'"
        :aria-pressed="ui.state.viewLevel === item.level"
        @click="ui.setViewLevel(item.level)"
      >
        <UIcon :name="item.icon" class="size-3.5" />
        {{ item.label }}
      </button>
    </div>

    <nav
      class="flex items-center gap-1 rounded-md border border-line-panel bg-surface-chrome/90 backdrop-blur-xs px-2 py-0.5 text-[11px] text-ink-dim"
      aria-label="Breadcrumb"
    >
      <UButton
        v-if="ui.state.viewLevel !== 'databases'"
        icon="i-ph-caret-left"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Back one level"
        @click="ui.setViewLevel(ui.state.viewLevel === 'tables' ? 'schemas' : 'databases')"
      />
      <template v-for="(crumb, i) in ui.breadcrumb" :key="crumb.label">
        <span v-if="i > 0" class="text-line-panel">/</span>
        <button
          type="button"
          class="hover:text-ink-bright transition-colors focus-visible:outline-2 focus-visible:outline-accent-500"
          @click="ui.setViewLevel(crumb.level)"
        >
          {{ crumb.label }}
        </button>
      </template>
    </nav>
  </div>

  <!-- Bottom left: zoom -->
  <div class="absolute bottom-4 left-4 z-10 sc-panel flex items-center gap-0.5 p-1">
    <UTooltip text="Zoom out">
      <UButton icon="i-ph-minus" color="neutral" variant="ghost" size="xs" aria-label="Zoom out" @click="zoomOut()" />
    </UTooltip>
    <UTooltip text="Reset zoom & fit (Ctrl+0)">
      <button
        type="button"
        class="px-1.5 text-[11px] font-mono tabular-nums text-ink-muted hover:text-ink-bright min-w-12 rounded-md
               focus-visible:outline-2 focus-visible:outline-accent-500"
        aria-label="Fit view"
        @click="onFitView()"
      >
        {{ zoomPercent }}
      </button>
    </UTooltip>
    <UTooltip text="Zoom in">
      <UButton icon="i-ph-plus" color="neutral" variant="ghost" size="xs" aria-label="Zoom in" @click="zoomIn()" />
    </UTooltip>
    <span class="w-px h-4 bg-line-panel mx-0.5" />
    <UTooltip text="Fit to screen (Ctrl+0)">
      <UButton icon="i-ph-corners-out" color="neutral" variant="ghost" size="xs" aria-label="Fit view" @click="onFitView()" />
    </UTooltip>
    <span class="w-px h-4 bg-line-panel mx-0.5" />
    <UTooltip text="Undo (Ctrl+Z)">
      <UButton
        icon="i-ph-arrow-u-up-left"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Undo"
        :disabled="!workspace.canUndo"
        @click="workspace.undo()"
      />
    </UTooltip>
    <UTooltip text="Redo (Ctrl+Shift+Z)">
      <UButton
        icon="i-ph-arrow-u-up-right"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Redo"
        :disabled="!workspace.canRedo"
        @click="workspace.redo()"
      />
    </UTooltip>
    <UTooltip v-if="ui.state.viewLevel === 'tables' && ui.state.editable" text="Auto-arrange layout (DAG)">
      <UButton
        icon="i-ph-flow-arrow"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Auto-arrange layout"
        @click="onAutoLayout()"
      />
    </UTooltip>
  </div>

  <!-- Top right: display options -->
  <div class="absolute top-4 right-4 z-10">
    <UPopover :content="{ align: 'end' }">
      <UButton
        icon="i-ph-sliders-horizontal"
        color="neutral"
        variant="ghost"
        size="md"
        aria-label="Display options"
        class="sc-panel"
      />

      <template #content>
        <div class="w-52 p-2.5 space-y-1.5">
          <p class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-dim px-1 pb-1 border-b border-line-chrome">
            Canvas Display
          </p>
          <label
            v-for="option in DISPLAY"
            :key="option.key"
            class="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 text-[12px] text-ink hover:bg-surface-raised/70 cursor-pointer"
          >
            <span class="flex items-center gap-2">
              <UIcon :name="option.icon" class="size-3.5 text-ink-dim" />
              {{ option.label }}
            </span>
            <USwitch
              :model-value="ui.state[option.key]"
              size="sm"
              @update:model-value="ui.toggleDisplay(option.key)"
            />
          </label>
        </div>
      </template>
    </UPopover>
  </div>
</template>
