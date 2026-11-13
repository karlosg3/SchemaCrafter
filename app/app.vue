<script setup lang="ts">
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { LEFT_WIDTH, RIGHT_WIDTH, useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

// ssr:false means this only ever runs in the browser, but hydration stays an
// explicit action rather than a side effect of reading state.
const workspace = useWorkspaceStore()
const ui = useUiStore()
const toast = useToast()

const isDesktop = isDesktopApp()
const desktopDoc = isDesktop ? useDesktopDocumentStore() : null
const desktopActions = isDesktop ? useDesktopDocumentActions() : null

let unlistenFileOpen: (() => void) | null = null
let unlistenDragDrop: (() => void) | null = null
let unlistenClose: (() => void) | null = null
let closePromptOpen = false
const isFileDragOver = ref(false)

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    workspace.flush()
    ui.flush()
  }
}

function onDesktopKeyDown(event: KeyboardEvent) {
  if (!desktopActions || !(event.ctrlKey || event.metaKey) || event.altKey) return
  const key = event.key.toLowerCase()

  if (key === 's') {
    event.preventDefault()
    void (event.shiftKey ? desktopActions.saveFileAs() : desktopActions.saveFile())
  } else if (key === 'o' && !event.shiftKey) {
    event.preventDefault()
    void desktopActions.openFile()
  } else if (key === 'n' && !event.shiftKey) {
    event.preventDefault()
    void desktopActions.newFile()
  }
}

onMounted(async () => {
  if (!desktopDoc || !desktopActions) {
    workspace.hydrate()
    ui.hydrate()

    if (workspace.loadWarning) {
      toast.add({ title: 'Could not restore your work', description: workspace.loadWarning, color: 'warning' })
    }

    // Autosave is debounced, so a tab closing mid-window would lose the tail.
    document.addEventListener('visibilitychange', onVisibilityChange)
    return
  }

  workspace.hydrateDesktopEmpty()
  ui.hydrate()
  desktopDoc.syncSavedRevision()

  const desktopFiles = await import('~/desktop/files')

  watch(
    () => desktopDoc.windowTitle,
    title => void desktopFiles.setDesktopWindowTitle(title).catch(() => {}),
    { immediate: true }
  )

  document.addEventListener('keydown', onDesktopKeyDown)

  try {
    const pendingPath = await desktopFiles.takePendingOpenFile()
    if (pendingPath) await desktopActions.openPath(pendingPath, { skipDirtyCheck: true })
  } catch (error) {
    console.error('Failed to check startup file argument:', error)
  }

  try {
    unlistenFileOpen = await desktopFiles.listenOpenFileRequests((paths) => {
      if (paths[0]) void desktopActions.openPath(paths[0])
    })
  } catch (error) {
    console.error('Failed to listen for file-opened events:', error)
  }

  try {
    unlistenDragDrop = await desktopFiles.listenDesktopDragDrop({
      onHover: (hovering) => {
        isFileDragOver.value = hovering
      },
      onDrop: (path) => {
        isFileDragOver.value = false
        void desktopActions.openPath(path)
      }
    })
  } catch (error) {
    console.error('Failed to attach drag-and-drop file handler:', error)
  }

  try {
    unlistenClose = await desktopFiles.onDesktopCloseRequested(async (preventDefault) => {
      if (!desktopDoc.isDirty) return
      if (closePromptOpen) {
        preventDefault()
        return
      }
      closePromptOpen = true
      try {
        const discard = await desktopFiles.confirmDesktopClose(
          `You have unsaved changes in "${desktopDoc.fileName}". Close without saving?`
        )
        if (!discard) preventDefault()
      } finally {
        closePromptOpen = false
      }
    })
  } catch (error) {
    console.error('Failed to attach desktop close guard:', error)
  }
})

onBeforeUnmount(() => {
  if (!desktopDoc) {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    workspace.flush()
    ui.flush()
    return
  }

  document.removeEventListener('keydown', onDesktopKeyDown)
  ui.flush()
  unlistenDragDrop?.()
  unlistenFileOpen?.()
  unlistenClose?.()
})

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

      <div
        v-if="isDesktop && isFileDragOver"
        class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-surface-root/80 backdrop-blur-sm"
      >
        <div class="rounded-2xl border-2 border-dashed border-sky-400/70 bg-surface-raised/95 px-8 py-6 text-center shadow-2xl">
          <UIcon name="i-lucide-file-up" class="mx-auto mb-2 size-8 text-sky-400" />
          <p class="text-[14px] font-semibold text-ink-bright">
            Drop project file to open
          </p>
          <p class="mt-1 text-[12px] text-ink-muted">
            Supports <code class="font-mono text-sky-300">.schemacrafter</code> and <code class="font-mono text-sky-300">.json</code>
          </p>
        </div>
      </div>
    </div>
  </UApp>
</template>
