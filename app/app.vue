<script setup lang="ts">
import { LEFT_WIDTH, RIGHT_WIDTH, useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

// ssr:false means this only ever runs in the browser, but hydration stays an
// explicit action rather than a side effect of reading state.
const workspace = useWorkspaceStore()
const ui = useUiStore()

const toast = useToast()

onMounted(() => {
  workspace.hydrate()
  ui.hydrate()

  if (workspace.loadWarning) {
    toast.add({ title: 'Could not restore your work', description: workspace.loadWarning, color: 'warning' })
  }

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

/**
 * UDashboardSidebar models "collapsed"; the navbar buttons and the store speak
 * "open". Bridging here keeps the store's vocabulary aligned with the UI.
 */
const leftCollapsed = computed({
  get: () => !ui.state.leftOpen,
  set: (value: boolean) => { ui.state.leftOpen = !value }
})

const rightCollapsed = computed({
  get: () => !ui.state.rightOpen,
  set: (value: boolean) => { ui.state.rightOpen = !value }
})
</script>

<template>
  <UApp>
    <div class="h-screen w-screen flex flex-col overflow-hidden bg-surface-root">
      <AppNavbar />

      <!--
        unit="px" so the prototype's pixel geometry applies directly.
        UDashboardGroup owns panel sizing and persists it, which is what let the
        two hand-rolled window-mousemove resize handlers go away.
      -->
      <UDashboardGroup
        unit="px"
        storage="local"
        storage-key="schemacrafter_panels_v2"
        class="flex-1 min-h-0"
      >
        <UDashboardSidebar
          id="left"
          v-model:collapsed="leftCollapsed"
          side="left"
          resizable
          collapsible
          :collapsed-size="0"
          :min-size="LEFT_WIDTH.min"
          :max-size="LEFT_WIDTH.max"
          :default-size="LEFT_WIDTH.default"
          :toggle="false"
          :ui="{ root: 'bg-surface-chrome border-e-2 border-line-chrome' }"
        >
          <LeftSidebar />
        </UDashboardSidebar>

        <UDashboardPanel id="canvas">
          <template #body>
            <CanvasStage />
          </template>
        </UDashboardPanel>

        <UDashboardSidebar
          id="code"
          v-model:collapsed="rightCollapsed"
          side="right"
          resizable
          collapsible
          :collapsed-size="0"
          :min-size="RIGHT_WIDTH.min"
          :max-size="RIGHT_WIDTH.max"
          :default-size="RIGHT_WIDTH.default"
          :toggle="false"
          :ui="{ root: 'bg-surface-chrome border-s-2 border-line-chrome' }"
        >
          <RightSidebar />
        </UDashboardSidebar>
      </UDashboardGroup>
    </div>
  </UApp>
</template>
