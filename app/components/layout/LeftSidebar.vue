<script setup lang="ts">
import type { RailTab } from '~/stores/ui'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

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

const search = ref('')

const dbId = computed(() => ui.activeDbId)

const schemas = computed(() => dbId.value ? workspace.schemasOfDatabase(dbId.value) : [])
const tables = computed(() => dbId.value ? workspace.tablesOfDatabase(dbId.value) : [])
const enums = computed(() => dbId.value ? workspace.enumsOfDatabase(dbId.value) : [])

function matches(name: string) {
  return name.toLowerCase().includes(search.value.trim().toLowerCase())
}

const visibleTables = computed(() => tables.value.filter(t => matches(t.name)))
const visibleEnums = computed(() => enums.value.filter(e => matches(e.name)))
const visibleSchemas = computed(() => schemas.value.filter(s => matches(s.name)))
const visibleDatabases = computed(() => workspace.databases.filter(d => matches(d.name)))

const addLabel = computed(() => ({
  databases: 'Add database',
  schemas: 'Add schema',
  tables: 'Add table',
  enums: 'Add enum'
}[ui.state.railTab]))

const emit = defineEmits<{
  create: [tab: RailTab]
  edit: [tab: RailTab, id: string]
  remove: [tab: RailTab, id: string]
}>()

/** refactor-plan.md:46 — a schema is only deletable while it holds no tables. */
function schemaDeletable(id: string) {
  return workspace.tablesOfSchema(id).length === 0
}
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
    </nav>

    <!-- List pane -->
    <div class="flex-1 min-w-0 flex flex-col min-h-0">
      <div class="px-3 pt-3 pb-2">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
          {{ ui.state.railTab }}
        </p>
      </div>

      <div class="px-2 pb-2">
        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          placeholder="Search…"
          size="sm"
          class="w-full"
        />
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 space-y-px">
        <template v-if="ui.state.railTab === 'databases'">
          <SidebarRow
            v-for="db in visibleDatabases"
            :key="db.id"
            :label="db.name"
            :gradient="db.gradient"
            :count="workspace.schemasOfDatabase(db.id).length"
            :active="db.id === dbId"
            :deletable="workspace.databases.length > 1"
            delete-hint="The last database cannot be deleted"
            @select="ui.selectDatabase(db.id)"
            @edit="emit('edit', 'databases', db.id)"
            @remove="emit('remove', 'databases', db.id)"
          />
        </template>

        <template v-else-if="ui.state.railTab === 'schemas'">
          <SidebarRow
            v-for="s in visibleSchemas"
            :key="s.id"
            :label="s.name"
            :gradient="s.gradient"
            :count="workspace.tablesOfSchema(s.id).length"
            :active="s.id === ui.activeSchemaId"
            :deletable="schemaDeletable(s.id)"
            delete-hint="Schema still contains tables"
            @select="ui.selectSchema(s.id)"
            @edit="emit('edit', 'schemas', s.id)"
            @remove="emit('remove', 'schemas', s.id)"
          />
        </template>

        <template v-else-if="ui.state.railTab === 'tables'">
          <SidebarRow
            v-for="t in visibleTables"
            :key="t.id"
            :label="t.name"
            :gradient="t.gradient"
            :count="t.columns.length"
            @select="ui.drillInto('tables', t.schemaId)"
            @edit="emit('edit', 'tables', t.id)"
            @remove="emit('remove', 'tables', t.id)"
          />
        </template>

        <template v-else>
          <SidebarRow
            v-for="e in visibleEnums"
            :key="e.id"
            :label="e.name"
            :gradient="['#ef4444', '#b91c1c']"
            :count="e.values.length"
            @select="ui.drillInto('tables', e.schemaId)"
            @edit="emit('edit', 'enums', e.id)"
            @remove="emit('remove', 'enums', e.id)"
          />
        </template>
      </div>

      <div class="p-2 border-t-2 border-line-chrome">
        <button
          type="button"
          class="w-full h-8 border-2 border-dashed border-line-dashed text-[11.5px]
                 text-accent-400 hover:bg-white/5 transition-colors
                 focus-visible:outline-2 focus-visible:outline-accent-500"
          @click="emit('create', ui.state.railTab)"
        >
          + {{ addLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
