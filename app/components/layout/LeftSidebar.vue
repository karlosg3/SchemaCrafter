<script setup lang="ts">
import type { RailTab } from '~/stores/ui'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'
import DatabasesPanel from './panels/DatabasesPanel.vue'
import SchemasPanel from './panels/SchemasPanel.vue'
import TablesPanel from './panels/TablesPanel.vue'
import EnumsPanel from './panels/EnumsPanel.vue'

const ui = useUiStore()
const workspace = useWorkspaceStore()

/**
 * refactor-plan.md:12 — the rail is a toolbar, not navigation. Each button
 * swaps the pane beside it rather than routing anywhere.
 */
const RAIL: { tab: RailTab, icon: string, label: string }[] = [
  { tab: 'databases', icon: 'i-ph-database', label: 'Databases' },
  { tab: 'schemas', icon: 'i-ph-folders', label: 'Schemas' },
  { tab: 'tables', icon: 'i-ph-table', label: 'Tables' },
  { tab: 'enums', icon: 'i-ph-list-bullets', label: 'Enums' }
]

const PANELS = {
  databases: DatabasesPanel,
  schemas: SchemasPanel,
  tables: TablesPanel,
  enums: EnumsPanel
} as const

const search = ref('')

// Searching for a table then switching to enums should not silently filter the
// new list by the old query.
watch(() => ui.state.railTab, () => { search.value = '' })

/** "Tables · sales" — the prototype qualifies the lower two by their parent. */
const heading = computed(() => {
  const tab = ui.state.railTab
  if (tab === 'databases') return 'Databases'
  if (tab === 'schemas') return `Schemas · ${ui.activeDatabase?.name ?? '—'}`
  return `${tab === 'tables' ? 'Tables' : 'Enums'} · ${ui.activeSchema?.name ?? '—'}`
})
</script>

<template>
  <div class="h-full flex min-h-0">
    <!-- Icon rail -->
    <nav
      data-rail
      class="w-14 shrink-0 flex flex-col items-center gap-1 py-2 border-r-2 border-line-rail"
      aria-label="Sidebar sections"
    >
      <UTooltip v-for="item in RAIL" :key="item.tab" :text="item.label" :content="{ side: 'right' }">
        <UButton
          :icon="item.icon"
          :color="ui.state.railTab === item.tab ? 'primary' : 'neutral'"
          :variant="ui.state.railTab === item.tab ? 'solid' : 'ghost'"
          size="md"
          :aria-label="item.label"
          :aria-pressed="ui.state.railTab === item.tab"
          @click="ui.setRailTab(item.tab)"
        />
      </UTooltip>

      <span class="mt-auto text-[9px] font-mono text-ink-faint" :title="`${workspace.databases.length} databases`">
        {{ workspace.databases.length }}
      </span>
    </nav>

    <!-- List pane -->
    <div class="flex-1 min-w-0 flex flex-col min-h-0">
      <div class="px-3 pt-3 pb-2">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim truncate">
          {{ heading }}
        </p>
      </div>

      <div class="px-2 pb-2">
        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          placeholder="Search…"
          size="sm"
          class="w-full"
          :aria-label="`Search ${ui.state.railTab}`"
        />
      </div>

      <component :is="PANELS[ui.state.railTab]" :search="search" />
    </div>
  </div>
</template>
