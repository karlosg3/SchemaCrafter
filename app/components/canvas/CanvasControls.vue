<script setup lang="ts">
import { useVueFlow } from '@vue-flow/core'
import type { ViewLevel } from '~/stores/ui'
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()

/**
 * Rendered inside <VueFlow>'s default slot, which sits outside the transformed
 * viewport — so these islands stay put while the canvas pans and zooms, and
 * they can reach the flow instance by injection rather than by prop.
 */
const { zoomIn, zoomOut, fitView, viewport } = useVueFlow()

const LEVELS: { level: ViewLevel, label: string }[] = [
  { level: 'databases', label: 'Databases' },
  { level: 'schemas', label: 'Schemas' },
  { level: 'tables', label: 'Tables' }
]

const DISPLAY = [
  { key: 'showRelations', label: 'Show relations' },
  { key: 'showEnums', label: 'Show enums' },
  { key: 'showTypes', label: 'Show types' },
  { key: 'editable', label: 'Editable' }
] as const

const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)

function onFitView() {
  fitView({ padding: 0.2, maxZoom: 1 })
}
</script>

<template>
  <!-- Top left: view switch + breadcrumb -->
  <div class="absolute top-4 left-4 z-10 flex flex-col gap-2 items-start">
    <div class="sc-panel flex items-center gap-0.5 p-[3px]">
      <button
        v-for="item in LEVELS"
        :key="item.level"
        type="button"
        class="px-2.5 py-1 text-[11.5px] transition-colors focus-visible:outline-2 focus-visible:outline-accent-500"
        :class="ui.state.viewLevel === item.level
          ? 'bg-accent-500 text-white'
          : 'text-ink-muted hover:text-ink-bright hover:bg-white/5'"
        :aria-pressed="ui.state.viewLevel === item.level"
        @click="ui.setViewLevel(item.level)"
      >
        {{ item.label }}
      </button>
    </div>

    <nav class="flex items-center gap-1 text-[11px] text-ink-dim" aria-label="Breadcrumb">
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
  <div class="absolute bottom-4 left-4 z-10 sc-panel flex items-center gap-0.5 p-[3px]">
    <UButton icon="i-ph-minus" color="neutral" variant="ghost" size="xs" aria-label="Zoom out" @click="zoomOut()" />
    <button
      type="button"
      class="px-1.5 text-[11px] font-mono text-ink-muted hover:text-ink-bright min-w-12
             focus-visible:outline-2 focus-visible:outline-accent-500"
      aria-label="Fit view"
      @click="onFitView()"
    >
      {{ zoomPercent }}
    </button>
    <UButton icon="i-ph-plus" color="neutral" variant="ghost" size="xs" aria-label="Zoom in" @click="zoomIn()" />
    <span class="w-px h-4 bg-line-panel mx-0.5" />
    <UButton icon="i-ph-corners-out" color="neutral" variant="ghost" size="xs" aria-label="Fit view" @click="onFitView()" />
  </div>

  <!-- Top right: display options -->
  <div class="absolute top-4 right-4 z-10">
    <UPopover :content="{ align: 'end' }">
      <UButton icon="i-ph-gear-six" color="neutral" variant="ghost" size="md" aria-label="Display options" class="sc-panel" />

      <template #content>
        <div class="w-50 p-2 space-y-1">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim px-1 pb-1">
            Display
          </p>
          <label
            v-for="option in DISPLAY"
            :key="option.key"
            class="flex items-center justify-between gap-3 px-1 py-1 text-[11.5px] text-ink cursor-pointer"
          >
            {{ option.label }}
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
