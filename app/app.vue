<script setup lang="ts">
import type { RecentFileEntry, RecoveryDraftResult } from '~/desktop/session'
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { LEFT_WIDTH, RIGHT_WIDTH, useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

// ssr:false means this only ever runs in the browser, but hydration stays an
// explicit action rather than a side effect of reading state.
const workspace = useWorkspaceStore()
const ui = useUiStore()
const toast = useToast()
const actions = useWorkspaceActions()

const isDesktop = isDesktopApp()
const desktopDoc = isDesktop ? useDesktopDocumentStore() : null
const desktopActions = isDesktop ? useDesktopDocumentActions() : null

const recentFiles = ref<RecentFileEntry[]>([])
const recoveryDraft = ref<RecoveryDraftResult | null>(null)

let unlistenFileOpen: (() => void) | null = null
let unlistenDragDrop: (() => void) | null = null
let unlistenClose: (() => void) | null = null
let closePromptOpen = false
let recoveryTimer: ReturnType<typeof setTimeout> | null = null
const isFileDragOver = ref(false)

async function refreshDesktopSessionMeta() {
  if (!isDesktop) return
  const session = await import('~/desktop/session')
  recentFiles.value = await session.loadRecentFiles()
}

async function onRestoreRecovery() {
  if (!desktopDoc || !recoveryDraft.value) return
  desktopDoc.restoreRecoveryDraft(recoveryDraft.value)
  const firstDb = workspace.databases[0]
  if (firstDb) ui.selectDatabase(firstDb.id)
  recoveryDraft.value = null
  const session = await import('~/desktop/session')
  await session.clearRecoveryDraft()
  toast.add({ title: 'Restored unsaved session', color: 'success' })
}

async function onDiscardRecovery() {
  recoveryDraft.value = null
  const session = await import('~/desktop/session')
  await session.clearRecoveryDraft()
}

async function onOpenRecent(path: string) {
  if (!desktopActions) return
  await desktopActions.openRecentPath(path)
  await refreshDesktopSessionMeta()
}

async function onRemoveRecent(path: string) {
  const session = await import('~/desktop/session')
  recentFiles.value = await session.removeRecentFile(path)
}

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
    if (pendingPath) {
      await desktopActions.openPath(pendingPath, { skipDirtyCheck: true })
    } else {
      const session = await import('~/desktop/session')
      recentFiles.value = await session.loadRecentFiles()
      recoveryDraft.value = await session.loadRecoveryDraft()
      ui.welcomeOpen = true
    }
  } catch (error) {
    console.error('Failed to initialize desktop session:', error)
  }

  // Keep a debounced 2s crash-recovery snapshot in AppData while workspace has unsaved changes.
  watch(
    () => [workspace.revision, desktopDoc.isDirty, desktopDoc.currentFilePath] as const,
    ([, dirty, sourcePath]) => {
      if (recoveryTimer !== null) {
        clearTimeout(recoveryTimer)
        recoveryTimer = null
      }
      if (!dirty) return
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null
        void import('~/desktop/session').then(s => s.saveRecoveryDraft(workspace.workspace, sourcePath))
      }, 2000)
    }
  )

  watch(
    () => desktopDoc.currentFilePath,
    () => { void refreshDesktopSessionMeta() }
  )

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
      if (!desktopDoc.isDirty) {
        const session = await import('~/desktop/session')
        await session.clearRecoveryDraft()
        return
      }
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
        else {
          const session = await import('~/desktop/session')
          await session.clearRecoveryDraft()
        }
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

  if (recoveryTimer !== null) {
    clearTimeout(recoveryTimer)
    recoveryTimer = null
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
          :ui="{ root: 'bg-surface-chrome border-e border-line-chrome' }"
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
          :ui="{ root: 'bg-surface-chrome border-s border-line-chrome' }"
        >
          <RightSidebar />
        </UDashboardSidebar>
      </UDashboardGroup>

      <div
        v-if="isDesktop && isFileDragOver"
        class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-surface-root/80 backdrop-blur-sm"
      >
        <div class="rounded-lg border-2 border-dashed border-sky-400/70 bg-surface-raised/95 px-8 py-6 text-center shadow-2xl">
          <UIcon name="i-lucide-file-up" class="mx-auto mb-2 size-8 text-sky-400" />
          <p class="text-[14px] font-semibold text-ink-bright">
            Drop project file to open
          </p>
          <p class="mt-1 text-[12px] text-ink-muted">
            Supports <code class="font-mono text-sky-300">.schemacrafter</code> and <code class="font-mono text-sky-300">.json</code>
          </p>
        </div>
      </div>

      <WelcomeModal
        v-model:open="ui.welcomeOpen"
        :recovery="recoveryDraft"
        :recent-files="recentFiles"
        @restore-recovery="onRestoreRecovery()"
        @discard-recovery="onDiscardRecovery()"
        @open-recent="onOpenRecent"
        @remove-recent="onRemoveRecent"
        @request-import-workspace="actions.promptWebWorkspaceImport()"
      />
    </div>
  </UApp>
</template>
