<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

// ssr:false means this only ever runs in the browser, but hydration stays an
// explicit action rather than a side effect of reading state.
const workspace = useWorkspaceStore()
const ui = useUiStore()

onMounted(() => {
  workspace.hydrate()
  ui.hydrate()

  // Autosave is debounced, so a tab closing mid-window would lose the tail.
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  workspace.flush()
})

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') workspace.flush()
}

const summary = computed(() =>
  workspace.databases.map(db => ({
    id: db.id,
    name: db.name,
    engine: db.engine,
    schemas: workspace.schemasOfDatabase(db.id).length,
    tables: workspace.tablesOfDatabase(db.id).length,
    enums: workspace.enumsOfDatabase(db.id).length
  }))
)
</script>

<template>
  <UApp>
    <!-- P2 scaffold: proves hydration, migration and the store wiring. The
         real shell (navbar + two sidebars + canvas) lands in P3. -->
    <div class="h-screen w-screen flex items-center justify-center bg-surface-root p-8">
      <div class="sc-panel w-full max-w-2xl p-6">
        <div class="flex items-baseline justify-between border-b border-line-chrome pb-3">
          <h1 class="text-ink-bright font-semibold">
            SchemaCrafter
          </h1>
          <span class="text-ink-dim text-xs font-mono">
            loaded: {{ workspace.loadSource ?? '…' }}
          </span>
        </div>

        <p v-if="workspace.loadWarning" class="text-sync-pending text-xs mt-3">
          {{ workspace.loadWarning }}
        </p>

        <ul class="mt-4 space-y-2">
          <li
            v-for="db in summary"
            :key="db.id"
            class="flex items-center justify-between text-xs"
          >
            <span class="text-ink">{{ db.name }}</span>
            <span class="text-ink-dim font-mono">
              {{ db.engine }} · {{ db.schemas }} schemas · {{ db.tables }} tables · {{ db.enums }} enums
            </span>
          </li>
        </ul>

        <p class="text-ink-faint text-xs mt-4">
          Active: {{ ui.activeDatabase?.name ?? 'none' }} · view {{ ui.state.viewLevel }}
        </p>
      </div>
    </div>
  </UApp>
</template>
