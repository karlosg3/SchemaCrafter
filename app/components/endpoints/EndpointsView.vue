<script setup lang="ts">
import type { EndpointEntity, HttpMethod, ModuleEntity } from '#shared/types/workspace'
import { HTTP_METHODS } from '#shared/types/workspace'
import { resolveFullEndpointPath, splitPathSegments } from '#shared/utils/apiDesign'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'
import { HTTP_METHOD_BADGE, HTTP_METHOD_TEXT } from '~/utils/httpMethod'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const apiDialogs = useApiDialogs()

const search = ref('')
const activeMethod = ref<HttpMethod | 'ALL'>('ALL')
const collapsedModules = ref<Set<string>>(new Set())
const highlightedEndpointId = ref<string | null>(null)

const dbModules = computed<ModuleEntity[]>(() =>
  ui.activeDbId ? workspace.modulesOfDatabase(ui.activeDbId) : []
)

const dbTables = computed(() =>
  ui.activeDbId ? workspace.tablesOfDatabase(ui.activeDbId) : []
)

const tableById = computed(() =>
  new Map(dbTables.value.map(t => [t.id, t]))
)

const activeFilterTable = computed(() =>
  ui.endpointFilterTableId ? tableById.value.get(ui.endpointFilterTableId) ?? null : null
)

const activeFilterModule = computed(() =>
  ui.endpointFilterModuleId ? dbModules.value.find(m => m.id === ui.endpointFilterModuleId) ?? null : null
)

interface ModuleGroup {
  module: ModuleEntity
  endpoints: {
    entity: EndpointEntity
    fullPath: string
    tokens: { text: string, isParam: boolean }[]
  }[]
}

const filteredGroups = computed<ModuleGroup[]>(() => {
  const q = search.value.trim().toLowerCase()
  const methodFilter = activeMethod.value
  const tableFilter = ui.endpointFilterTableId
  const moduleFilter = ui.endpointFilterModuleId

  const groups: ModuleGroup[] = []

  for (const mod of dbModules.value) {
    if (moduleFilter && mod.id !== moduleFilter) continue
    const rawEndpoints = workspace.endpointsOfModule(mod.id)

    const matchedEndpoints = rawEndpoints
      .map((ep) => {
        const fullPath = resolveFullEndpointPath(mod.basePath, ep.path)
        return {
          entity: ep,
          fullPath,
          tokens: splitPathSegments(fullPath)
        }
      })
      .filter(({ entity, fullPath }) => {
        if (methodFilter !== 'ALL' && entity.method !== methodFilter) return false
        if (tableFilter && !entity.tableIds.includes(tableFilter)) return false
        if (!q) return true

        const tableNames = entity.tableIds
          .map(tid => tableById.value.get(tid)?.name ?? '')
          .join(' ')
          .toLowerCase()
        return fullPath.toLowerCase().includes(q)
          || entity.path.toLowerCase().includes(q)
          || entity.description.toLowerCase().includes(q)
          || entity.method.toLowerCase().includes(q)
          || mod.name.toLowerCase().includes(q)
          || tableNames.includes(q)
      })

    const moduleMatchesDirectly = !q && methodFilter === 'ALL' && !tableFilter
    const moduleMatchesTable = !!tableFilter && mod.tableIds.includes(tableFilter) && methodFilter === 'ALL' && !q
    const moduleMatchesSearch = !!q && (
      mod.name.toLowerCase().includes(q)
      || mod.basePath.toLowerCase().includes(q)
      || (mod.description?.toLowerCase().includes(q) ?? false)
    ) && methodFilter === 'ALL' && !tableFilter

    if (matchedEndpoints.length > 0 || moduleMatchesDirectly || moduleMatchesTable || moduleMatchesSearch) {
      groups.push({ module: mod, endpoints: matchedEndpoints })
    }
  }

  return groups
})

const totalEndpointsCount = computed(() =>
  ui.activeDbId ? workspace.endpointsOfDatabase(ui.activeDbId).length : 0
)

const visibleEndpointsCount = computed(() =>
  filteredGroups.value.reduce((acc, g) => acc + g.endpoints.length, 0)
)

const linkedTablesCount = computed(() => {
  const ids = new Set<string>()
  for (const mod of dbModules.value) {
    for (const tid of mod.tableIds) ids.add(tid)
  }
  return ids.size
})

function toggleModuleCollapse(moduleId: string) {
  const next = new Set(collapsedModules.value)
  if (next.has(moduleId)) next.delete(moduleId)
  else next.add(moduleId)
  collapsedModules.value = next
}

function scrollToElement(domId: string, endpointId?: string) {
  const el = document.getElementById(domId)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (endpointId) {
    highlightedEndpointId.value = endpointId
    setTimeout(() => {
      if (highlightedEndpointId.value === endpointId) highlightedEndpointId.value = null
    }, 1500)
  }
}

function clearAllFilters() {
  search.value = ''
  activeMethod.value = 'ALL'
  ui.clearEndpointFilters()
}
</script>

<template>
  <div class="h-full w-full flex min-h-0 bg-[#0F213A] [.light_&]:bg-surface-canvas overflow-hidden">
    <!-- Scalar-style left API index -->
    <aside class="hidden md:flex w-68 shrink-0 flex-col min-h-0 border-r border-line-chrome bg-surface-chrome">
      <div class="p-3 border-b border-line-chrome space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <UIcon name="i-ph-plugs-connected" class="size-3.5 text-accent-400 [.light_&]:text-accent-600 shrink-0" />
            <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim truncate">
              API Reference
            </span>
          </div>
          <span class="rounded border border-line-row bg-surface-root/80 px-1.5 py-0.5 font-mono tabular-nums text-[10px] text-ink-dim">
            {{ totalEndpointsCount }}
          </span>
        </div>

        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          placeholder="Filter path, table, desc…"
          size="xs"
          class="w-full"
        >
          <template v-if="search" #trailing>
            <UButton
              icon="i-ph-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="search = ''"
            />
          </template>
        </UInput>

        <!-- Method filter pills -->
        <div class="flex flex-wrap gap-1 rounded-md bg-surface-root/75 p-1 border border-line-row">
          <button
            type="button"
            class="rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold transition-colors"
            :class="activeMethod === 'ALL'
              ? 'border-accent-500/50 bg-accent-500/18 text-accent-300 [.light_&]:bg-surface-block [.light_&]:text-accent-700 [.light_&]:border-accent-600/35'
              : 'border-transparent text-ink-dim hover:text-ink'"
            @click="activeMethod = 'ALL'"
          >
            ALL
          </button>
          <button
            v-for="m in HTTP_METHODS"
            :key="m"
            type="button"
            class="rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold transition-colors"
            :class="activeMethod === m
              ? `${HTTP_METHOD_BADGE[m]} ring-1 ring-current`
              : 'border-transparent text-ink-dim hover:text-ink'"
            @click="activeMethod = activeMethod === m ? 'ALL' : m"
          >
            {{ m }}
          </button>
        </div>
      </div>

      <!-- Tree navigation -->
      <div class="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
        <div
          v-for="group in filteredGroups"
          :key="group.module.id"
          class="space-y-0.5"
        >
          <button
            type="button"
            class="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-surface-raised/75 transition-colors"
            @click="toggleModuleCollapse(group.module.id); scrollToElement(`mod-section-${group.module.id}`)"
          >
            <UIcon
              :name="collapsedModules.has(group.module.id) ? 'i-ph-caret-right' : 'i-ph-caret-down'"
              class="size-3 text-ink-dim shrink-0"
            />
            <span
              class="size-2 rounded-xs shrink-0"
              :style="{ background: `linear-gradient(135deg, ${group.module.gradient[0]}, ${group.module.gradient[1]})` }"
            />
            <span class="flex-1 min-w-0 text-[12px] font-semibold text-ink-bright truncate">
              {{ group.module.name }}
            </span>
            <span class="font-mono tabular-nums text-[10px] text-ink-dim shrink-0">
              {{ group.endpoints.length }}
            </span>
          </button>

          <div
            v-if="!collapsedModules.has(group.module.id)"
            class="pl-4 space-y-0.5"
          >
            <button
              v-for="item in group.endpoints"
              :key="item.entity.id"
              type="button"
              class="w-full flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-surface-raised/75 transition-colors"
              @click="scrollToElement(`ep-card-${item.entity.id}`, item.entity.id)"
            >
              <span
                class="w-10 shrink-0 font-mono text-[9.5px] font-bold"
                :class="HTTP_METHOD_TEXT[item.entity.method]"
              >
                {{ item.entity.method }}
              </span>
              <span class="flex-1 min-w-0 font-mono text-[11px] text-ink-muted truncate">
                {{ item.fullPath }}
              </span>
            </button>
          </div>
        </div>

        <p
          v-if="filteredGroups.length === 0 && dbModules.length > 0"
          class="px-2 py-6 text-center text-[11.5px] text-ink-dim"
        >
          No matching endpoints.
        </p>
      </div>

      <div v-if="ui.state.editable" class="p-2 border-t border-line-chrome flex gap-1.5">
        <UButton
          label="Module"
          icon="i-ph-plus"
          size="xs"
          color="neutral"
          variant="soft"
          class="flex-1 justify-center"
          :disabled="!ui.activeDbId"
          @click="ui.activeDbId && apiDialogs.createModule(ui.activeDbId)"
        />
        <UButton
          label="Endpoint"
          icon="i-ph-plus"
          size="xs"
          class="flex-1 justify-center"
          :disabled="!ui.activeDbId"
          @click="ui.activeDbId && apiDialogs.createEndpoint(ui.activeDbId, ui.endpointFilterModuleId ?? undefined)"
        />
      </div>
    </aside>

    <!-- Main Scalar/Swagger documentation surface -->
    <div class="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
      <div class="max-w-4xl mx-auto p-5 sm:p-7 space-y-6">
        <!-- Header strip -->
        <div class="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-line-chrome">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-[18px] font-semibold text-ink-bright tracking-tight">
                {{ ui.activeDatabase?.name ?? 'Workspace' }} API Endpoints
              </h1>
              <span class="rounded border border-line-panel bg-surface-block px-2 py-0.5 font-mono tabular-nums text-[10.5px] text-ink-muted">
                {{ dbModules.length }} {{ dbModules.length === 1 ? 'module' : 'modules' }}
              </span>
              <span class="rounded border border-line-panel bg-surface-block px-2 py-0.5 font-mono tabular-nums text-[10.5px] text-ink-muted">
                {{ visibleEndpointsCount }} {{ visibleEndpointsCount === 1 ? 'endpoint' : 'endpoints' }}
              </span>
              <span class="rounded border border-line-panel bg-surface-block px-2 py-0.5 font-mono tabular-nums text-[10.5px] text-ink-muted">
                {{ linkedTablesCount }} linked {{ linkedTablesCount === 1 ? 'table' : 'tables' }}
              </span>
            </div>
            <p class="text-[12px] text-ink-muted">
              Visual HTTP catalog connected directly to your database tables. Click any table chip to jump to its schema block.
            </p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <UButton
              label="Modules map"
              icon="i-ph-cubes"
              color="neutral"
              variant="outline"
              size="sm"
              @click="ui.setWorkspaceMode('modules')"
            />
            <UButton
              v-if="ui.state.editable"
              label="New module"
              icon="i-ph-folder-plus"
              color="neutral"
              variant="soft"
              size="sm"
              :disabled="!ui.activeDbId"
              @click="ui.activeDbId && apiDialogs.createModule(ui.activeDbId)"
            />
            <UButton
              v-if="ui.state.editable"
              label="New endpoint"
              icon="i-ph-plus"
              size="sm"
              :disabled="!ui.activeDbId"
              @click="ui.activeDbId && apiDialogs.createEndpoint(ui.activeDbId, ui.endpointFilterModuleId ?? undefined)"
            />
          </div>
        </div>

        <!-- Active cross-view filter banners -->
        <div
          v-if="activeFilterTable || activeFilterModule || activeMethod !== 'ALL' || search.trim()"
          class="flex flex-wrap items-center gap-2 rounded-md border border-accent-500/35 bg-accent-500/10 px-3 py-2 text-[11.5px]"
        >
          <UIcon name="i-ph-funnel" class="size-3.5 text-accent-400 [.light_&]:text-accent-600 shrink-0" />
          <span class="text-ink-muted">Active filters:</span>

          <span
            v-if="activeFilterTable"
            class="inline-flex items-center gap-1 rounded border border-accent-500/40 bg-surface-block px-2 py-0.5 font-mono text-[11px] text-ink-bright"
          >
            table:{{ activeFilterTable.name }}
            <button type="button" class="text-ink-dim hover:text-ink-bright" @click="ui.endpointFilterTableId = null">
              ×
            </button>
          </span>

          <span
            v-if="activeFilterModule"
            class="inline-flex items-center gap-1 rounded border border-accent-500/40 bg-surface-block px-2 py-0.5 text-[11px] text-ink-bright"
          >
            module: {{ activeFilterModule.name }}
            <button type="button" class="text-ink-dim hover:text-ink-bright" @click="ui.endpointFilterModuleId = null">
              ×
            </button>
          </span>

          <span
            v-if="activeMethod !== 'ALL'"
            class="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10.5px] font-semibold"
            :class="HTTP_METHOD_BADGE[activeMethod]"
          >
            {{ activeMethod }}
            <button type="button" @click="activeMethod = 'ALL'">×</button>
          </span>

          <button
            type="button"
            class="ml-auto text-[11px] font-medium text-accent-300 [.light_&]:text-accent-700 hover:underline"
            @click="clearAllFilters"
          >
            Clear all
          </button>
        </div>

        <!-- Empty database API state with 1-click table generators -->
        <div
          v-if="dbModules.length === 0"
          class="rounded-md border border-dashed border-line-panel bg-surface-block p-8 text-center space-y-5"
        >
          <span class="mx-auto size-11 rounded-md bg-accent-500/14 border border-accent-500/30 grid place-items-center text-accent-400 [.light_&]:text-accent-600">
            <UIcon name="i-ph-plugs-connected" class="size-5" />
          </span>
          <div class="space-y-1 max-w-md mx-auto">
            <h2 class="text-[15px] font-semibold text-ink-bright">
              Start mapping your API modules & endpoints
            </h2>
            <p class="text-[12px] text-ink-muted leading-relaxed">
              Create a module manually or generate CRUD endpoints in one click directly from your existing database tables.
            </p>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-2">
            <UButton
              label="Create module"
              icon="i-ph-plus"
              size="sm"
              :disabled="!ui.activeDbId"
              @click="ui.activeDbId && apiDialogs.createModule(ui.activeDbId)"
            />
            <UButton
              label="Open Modules canvas"
              icon="i-ph-cubes"
              color="neutral"
              variant="soft"
              size="sm"
              @click="ui.setWorkspaceMode('modules')"
            />
          </div>

          <div v-if="dbTables.length > 0 && ui.state.editable" class="pt-4 border-t border-line-row space-y-2.5">
            <p class="text-[11px] uppercase tracking-wider font-semibold text-ink-dim">
              Quick-generate CRUD from existing tables
            </p>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <button
                v-for="tbl in dbTables.slice(0, 8)"
                :key="tbl.id"
                type="button"
                class="inline-flex items-center gap-1.5 rounded border border-line-panel bg-surface-raised/70 px-2.5 py-1.5 font-mono text-[11.5px] text-ink hover:text-ink-bright hover:border-accent-500/50 transition-colors"
                @click="apiDialogs.generateEndpointsForTable(tbl.id)"
              >
                <UIcon name="i-ph-sparkle" class="size-3.5 text-accent-400 [.light_&]:text-accent-600" />
                <span>{{ tbl.name }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Filtered empty state -->
        <div
          v-else-if="filteredGroups.length === 0"
          class="rounded-md border border-line-panel bg-surface-block p-8 text-center space-y-3"
        >
          <p class="text-[13px] font-medium text-ink-bright">
            No endpoints match the current filters
          </p>
          <div class="flex items-center justify-center gap-2">
            <UButton label="Clear filters" color="neutral" variant="soft" size="xs" @click="clearAllFilters" />
            <UButton
              v-if="activeFilterTable && ui.state.editable"
              :label="`Generate endpoints for ${activeFilterTable.name}`"
              icon="i-ph-sparkle"
              size="xs"
              @click="apiDialogs.generateEndpointsForTable(activeFilterTable.id)"
            />
          </div>
        </div>

        <!-- Module sections -->
        <section
          v-for="group in filteredGroups"
          :id="`mod-section-${group.module.id}`"
          :key="group.module.id"
          class="rounded-md border border-line-block bg-surface-block overflow-hidden"
        >
          <!-- Module header -->
          <div
            class="h-[3px] w-full"
            :style="{ background: `linear-gradient(90deg, ${group.module.gradient[0]}, ${group.module.gradient[1]})` }"
          />
          <div class="px-4 py-3 border-b border-line-header bg-surface-raised/80 [.light_&]:bg-surface-raised space-y-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <UIcon name="i-ph-cubes" class="size-4 text-accent-400 [.light_&]:text-accent-600 shrink-0" />
                <h2 class="text-[14.5px] font-semibold text-ink-bright truncate">
                  {{ group.module.name }}
                </h2>
                <span
                  v-if="group.module.basePath"
                  class="rounded border border-line-panel bg-surface-chrome px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"
                >
                  {{ group.module.basePath }}
                </span>
              </div>

              <div class="flex items-center gap-1">
                <UTooltip text="Focus module on canvas">
                  <UButton
                    icon="i-ph-graph"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="ui.openModuleInCanvas(group.module.id)"
                  />
                </UTooltip>
                <UButton
                  v-if="ui.state.editable"
                  label="Endpoint"
                  icon="i-ph-plus"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  @click="ui.activeDbId && apiDialogs.createEndpoint(ui.activeDbId, group.module.id)"
                />
                <UTooltip v-if="ui.state.editable" text="Create table linked to this module">
                  <UButton
                    label="Table"
                    icon="i-ph-table"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="apiDialogs.createTableFromEndpoint({ moduleId: group.module.id })"
                  />
                </UTooltip>
                <UButton
                  v-if="ui.state.editable"
                  icon="i-ph-pencil-simple"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="apiDialogs.editModule(group.module.id)"
                />
                <UButton
                  v-if="ui.state.editable"
                  icon="i-ph-trash"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="hover:text-[#EC7484] [.light_&]:hover:text-[#A62C3E]"
                  @click="apiDialogs.removeModule(group.module.id)"
                />
              </div>
            </div>

            <p v-if="group.module.description" class="text-[12px] text-ink-muted">
              {{ group.module.description }}
            </p>

            <!-- Linked tables bar -->
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[10.5px] uppercase tracking-wider text-ink-dim mr-1">
                Entities:
              </span>
              <button
                v-for="tid in group.module.tableIds"
                :key="tid"
                type="button"
                class="inline-flex items-center gap-1 rounded border border-line-panel bg-surface-chrome px-2 py-0.5 font-mono text-[10.5px] text-ink hover:text-ink-bright hover:border-accent-500/50 transition-colors"
                title="Open table in Database view"
                @click="ui.openTableInDatabase(tid)"
              >
                <UIcon name="i-ph-table" class="size-3 text-accent-400 [.light_&]:text-accent-600" />
                <span>{{ tableById.get(tid)?.name ?? tid }}</span>
              </button>
              <span v-if="group.module.tableIds.length === 0" class="text-[11px] text-ink-dim italic">
                No linked tables yet
              </span>
            </div>
          </div>

          <!-- Endpoints list -->
          <div class="divide-y divide-line-row">
            <div
              v-for="item in group.endpoints"
              :id="`ep-card-${item.entity.id}`"
              :key="item.entity.id"
              class="group px-4 py-3 flex flex-col gap-2 transition-colors hover:bg-surface-raised/45"
              :class="highlightedEndpointId === item.entity.id ? 'bg-accent-500/14' : ''"
            >
              <div class="flex items-start gap-3">
                <span
                  class="w-16 text-center shrink-0 rounded border px-2 py-1 font-mono text-[10.5px] font-bold tracking-wide"
                  :class="HTTP_METHOD_BADGE[item.entity.method]"
                >
                  {{ item.entity.method }}
                </span>

                <div class="flex-1 min-w-0 space-y-1">
                  <div class="font-mono text-[13px] font-medium text-ink-bright break-all">
                    <span
                      v-for="(tok, idx) in item.tokens"
                      :key="idx"
                      :class="tok.isParam ? 'text-accent-300 [.light_&]:text-accent-700 font-semibold' : ''"
                    >{{ tok.text }}</span>
                  </div>
                  <p v-if="item.entity.description" class="text-[12px] text-ink-muted leading-snug">
                    {{ item.entity.description }}
                  </p>
                  <p v-else class="text-[11.5px] text-ink-dim italic">
                    No description
                  </p>
                </div>

                <!-- Row actions -->
                <div
                  v-if="ui.state.editable"
                  class="flex items-center gap-0.5 shrink-0 opacity-75 group-hover:opacity-100 transition-opacity"
                >
                  <UTooltip text="Create & link DB table from this route">
                    <UButton
                      icon="i-ph-table"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click="apiDialogs.createTableFromEndpoint({ endpointId: item.entity.id })"
                    />
                  </UTooltip>
                  <UTooltip text="Duplicate endpoint">
                    <UButton
                      icon="i-ph-copy"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click="workspace.duplicateEndpoint(item.entity.id)"
                    />
                  </UTooltip>
                  <UTooltip text="Edit endpoint">
                    <UButton
                      icon="i-ph-pencil-simple"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click="apiDialogs.editEndpoint(item.entity.id)"
                    />
                  </UTooltip>
                  <UTooltip text="Delete endpoint">
                    <UButton
                      icon="i-ph-trash"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="hover:text-[#EC7484] [.light_&]:hover:text-[#A62C3E]"
                      @click="apiDialogs.removeEndpoint(item.entity.id)"
                    />
                  </UTooltip>
                </div>
              </div>

              <!-- Endpoint entity chips row -->
              <div class="pl-19 flex flex-wrap items-center gap-1.5">
                <button
                  v-for="tid in item.entity.tableIds"
                  :key="tid"
                  type="button"
                  class="inline-flex items-center gap-1 rounded border border-line-row bg-surface-chrome/90 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted hover:text-ink-bright hover:border-accent-500/45 transition-colors"
                  title="Jump to table in Database view"
                  @click="ui.openTableInDatabase(tid)"
                >
                  <UIcon name="i-ph-table" class="size-2.5 text-accent-400 [.light_&]:text-accent-600" />
                  <span>{{ tableById.get(tid)?.name ?? tid }}</span>
                </button>
                <button
                  v-if="item.entity.tableIds.length === 0 && ui.state.editable"
                  type="button"
                  class="inline-flex items-center gap-1 rounded border border-dashed border-line-dashed px-1.5 py-0.5 text-[10px] text-ink-dim hover:text-ink-bright hover:border-accent-500/50 transition-colors"
                  @click="apiDialogs.createTableFromEndpoint({ endpointId: item.entity.id })"
                >
                  <UIcon name="i-ph-plus" class="size-2.5 text-accent-400 [.light_&]:text-accent-600" />
                  <span>Create table from route</span>
                </button>
              </div>
            </div>

            <div
              v-if="group.endpoints.length === 0"
              class="px-4 py-6 text-center text-[12px] text-ink-dim flex items-center justify-center gap-2"
            >
              <span>No endpoints in this module yet.</span>
              <button
                v-if="ui.state.editable"
                type="button"
                class="text-accent-300 [.light_&]:text-accent-700 font-medium hover:underline"
                @click="ui.activeDbId && apiDialogs.createEndpoint(ui.activeDbId, group.module.id)"
              >
                Add first endpoint
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
