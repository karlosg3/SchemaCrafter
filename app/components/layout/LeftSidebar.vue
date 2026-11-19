<script setup lang="ts">
import type { RailTab } from '~/stores/ui'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'
import DatabasesPanel from './panels/DatabasesPanel.vue'
import SchemasPanel from './panels/SchemasPanel.vue'
import TablesPanel from './panels/TablesPanel.vue'
import EnumsPanel from './panels/EnumsPanel.vue'
import ModulesPanel from './panels/ModulesPanel.vue'

const ui = useUiStore()
const workspace = useWorkspaceStore()

const RAIL: { tab: RailTab, icon: string, label: string }[] = [
  { tab: 'databases', icon: 'i-ph-database', label: 'Databases' },
  { tab: 'schemas', icon: 'i-ph-folders', label: 'Schemas' },
  { tab: 'tables', icon: 'i-ph-table', label: 'Tables' },
  { tab: 'enums', icon: 'i-ph-list-bullets', label: 'Enums' },
  { tab: 'modules', icon: 'i-ph-cubes', label: 'Modules' }
]

const PANELS = {
  databases: DatabasesPanel,
  schemas: SchemasPanel,
  tables: TablesPanel,
  enums: EnumsPanel,
  modules: ModulesPanel
} as const

const search = ref('')
watch(() => ui.state.railTab, () => { search.value = '' })

const heading = computed(() => {
  const tab = ui.state.railTab
  if (tab === 'databases') return 'Databases'
  if (tab === 'schemas') return 'Schemas'
  if (tab === 'modules') return 'API Modules'
  return tab === 'tables' ? 'Tables' : 'Enums'
})
</script>

<template>
  <div class="h-full flex min-h-0">
    <!-- Icon rail -->
    <nav
      data-rail
      class="w-13 shrink-0 flex flex-col items-center gap-1.5 py-2.5 border-r border-line-rail bg-surface-root"
      aria-label="Sidebar sections"
    >
      <UTooltip v-for="item in RAIL" :key="item.tab" :text="item.label" :content="{ side: 'right' }">
        <div class="relative w-full flex justify-center">
          <span
            v-if="ui.state.railTab === item.tab"
            class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent-400 [.light_&]:bg-accent-600"
          />
          <UButton
            :icon="item.icon"
            :color="ui.state.railTab === item.tab ? 'primary' : 'neutral'"
            :variant="ui.state.railTab === item.tab ? 'soft' : 'ghost'"
            size="md"
            :aria-label="item.label"
            :aria-pressed="ui.state.railTab === item.tab"
            @click="ui.setRailTab(item.tab)"
          />
        </div>
      </UTooltip>

      <div class="mt-auto flex flex-col items-center gap-0.5 pt-2 border-t border-line-rail w-8">
        <span class="text-[9.5px] font-mono tabular-nums text-ink-dim" :title="`${workspace.databases.length} databases`">
          {{ workspace.databases.length }}
        </span>
        <span class="text-[8.5px] uppercase tracking-wider text-ink-dim">DB</span>
      </div>
    </nav>

    <!-- List pane -->
    <div class="flex-1 min-w-0 flex flex-col min-h-0">
      <div class="px-3 pt-3 pb-2 space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim truncate">
            {{ heading }}
          </p>
        </div>

        <!-- Context bar -->
        <div
          v-if="ui.activeDatabase"
          class="flex items-center gap-1 rounded-md border border-line-row bg-surface-block/75 [.light_&]:bg-surface-raised px-2 py-1 text-[10.5px] text-ink-dim truncate"
        >
          <button
            type="button"
            class="truncate hover:text-ink-bright transition-colors"
            @click="ui.setRailTab('databases')"
          >
            {{ ui.activeDatabase.name }}
          </button>
          <template v-if="ui.state.railTab !== 'databases' && ui.state.railTab !== 'modules' && ui.activeSchema">
            <span class="text-line-panel shrink-0">/</span>
            <button
              type="button"
              class="truncate font-mono text-ink-muted hover:text-ink-bright transition-colors"
              @click="ui.setRailTab('schemas')"
            >
              {{ ui.activeSchema.name }}
            </button>
          </template>
        </div>
      </div>

      <div class="px-2 pb-2">
        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          placeholder="Filter…"
          size="sm"
          class="w-full"
          :aria-label="`Search ${ui.state.railTab}`"
        >
          <template v-if="search" #trailing>
            <UButton
              icon="i-ph-x"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Clear filter"
              @click="search = ''"
            />
          </template>
        </UInput>
      </div>

      <component :is="PANELS[ui.state.railTab]" :search="search" />
    </div>
  </div>
</template>
