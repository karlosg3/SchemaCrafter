import { defineStore } from 'pinia'
import type { Workspace } from '#shared/types/workspace'
import { slugify } from '#shared/utils/ids'
import {
  PROJECT_FILE_EXTENSION,
  fileNameFromPath,
  parseProjectFile,
  serializeProjectFile
} from '#shared/utils/projectFile'
import type { RecoveryDraftResult } from '~/desktop/session'
import { useUiStore } from './ui'
import { useWorkspaceStore } from './workspace'

let desktopFilesPromise: Promise<typeof import('~/desktop/files')> | null = null
function loadDesktopFiles() {
  return (desktopFilesPromise ??= import('~/desktop/files'))
}

let desktopSessionPromise: Promise<typeof import('~/desktop/session')> | null = null
function loadDesktopSession() {
  return (desktopSessionPromise ??= import('~/desktop/session'))
}

export interface DesktopFileOpResult {
  ok: boolean
  cancelled?: boolean
  migratedFromLegacy?: boolean
  fileName?: string
  error?: string
}

/**
 * Pure desktop document state and file I/O store.
 *
 * UI prompts (unsaved-change confirmations and toasts) live in
 * `useDesktopDocumentActions` so this store stays decoupled from Nuxt UI.
 */
export const useDesktopDocumentStore = defineStore('desktopDocument', () => {
  const workspaceStore = useWorkspaceStore()
  const uiStore = useUiStore()

  const currentFilePath = ref<string | null>(null)
  const savedRevision = ref(0)
  const isBusy = ref(false)

  const isDirty = computed(() =>
    workspaceStore.revision !== savedRevision.value || uiStore.hasUnappliedCode
  )
  const fileName = computed(() =>
    currentFilePath.value ? fileNameFromPath(currentFilePath.value) : 'Untitled'
  )
  const windowTitle = computed(() =>
    `${isDirty.value ? '• ' : ''}${fileName.value} — SchemaCrafter`
  )

  function syncSavedRevision(): void {
    savedRevision.value = workspaceStore.revision
    workspaceStore.captureBaseline()
  }

  function resetToNew(): void {
    uiStore.setHasUnappliedCode(false)
    workspaceStore.hydrateDesktopEmpty()
    currentFilePath.value = null
    syncSavedRevision()
    void loadDesktopSession().then(s => s.clearRecoveryDraft())
  }

  function loadTemplateWorkspace(next: Workspace): void {
    uiStore.setHasUnappliedCode(false)
    workspaceStore.loadExternalWorkspace(next)
    currentFilePath.value = null
    syncSavedRevision()
    void loadDesktopSession().then(s => s.clearRecoveryDraft())
  }

  function restoreRecoveryDraft(recovery: RecoveryDraftResult): void {
    uiStore.setHasUnappliedCode(false)
    workspaceStore.loadExternalWorkspace(recovery.workspace)
    currentFilePath.value = recovery.sourcePath
    // Keep dirty so closing/saving treats recovered edits as unsaved until saved.
    savedRevision.value = workspaceStore.revision - 1
  }

  async function openPath(path: string, options?: { viaRecent?: boolean }): Promise<DesktopFileOpResult> {
    if (isBusy.value) return { ok: false, cancelled: true }

    isBusy.value = true
    try {
      const files = await loadDesktopFiles()
      const raw = options?.viaRecent && typeof files.readRecentProjectFile === 'function'
        ? await files.readRecentProjectFile(path)
        : await files.readProjectFile(path)
      const parsed = parseProjectFile(raw)
      if (!parsed.ok) {
        return { ok: false, error: parsed.error }
      }

      uiStore.setHasUnappliedCode(false)
      workspaceStore.loadExternalWorkspace(parsed.workspace)
      if (parsed.migratedFromLegacy) {
        // Keep migrated legacy/single-project JSON exports dirty with no target path
        // so Save prompts for a `.schemacrafter` destination instead of overwriting them.
        currentFilePath.value = null
        savedRevision.value = workspaceStore.revision - 1
      } else {
        currentFilePath.value = path
        syncSavedRevision()
        void loadDesktopSession().then(s => s.recordRecentFile(path))
      }

      return {
        ok: true,
        migratedFromLegacy: parsed.migratedFromLegacy,
        fileName: fileNameFromPath(path)
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      isBusy.value = false
    }
  }

  async function pickAndOpenFile(): Promise<DesktopFileOpResult> {
    if (isBusy.value) return { ok: false, cancelled: true }
    const { pickOpenProjectFile } = await loadDesktopFiles()
    const selected = await pickOpenProjectFile()
    if (!selected) return { ok: false, cancelled: true }
    return openPath(selected)
  }

  async function writeWorkspaceToPath(path: string): Promise<DesktopFileOpResult> {
    isBusy.value = true
    try {
      const { writeProjectFile } = await loadDesktopFiles()
      await writeProjectFile(path, serializeProjectFile(workspaceStore.workspace))
      currentFilePath.value = path
      syncSavedRevision()
      void loadDesktopSession().then(async (s) => {
        await s.recordRecentFile(path)
        await s.clearRecoveryDraft()
      })
      return { ok: true, fileName: fileNameFromPath(path) }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      isBusy.value = false
    }
  }

  async function saveFile(): Promise<DesktopFileOpResult> {
    if (isBusy.value) return { ok: false, cancelled: true }
    if (!currentFilePath.value) return saveFileAs()
    return writeWorkspaceToPath(currentFilePath.value)
  }

  async function saveFileAs(): Promise<DesktopFileOpResult> {
    if (isBusy.value) return { ok: false, cancelled: true }
    const { pickSaveProjectFile } = await loadDesktopFiles()
    const defaultName = `${slugify(uiStore.activeDatabase?.name ?? 'workspace')}.${PROJECT_FILE_EXTENSION}`
    const selected = await pickSaveProjectFile(currentFilePath.value ?? defaultName)
    if (!selected) return { ok: false, cancelled: true }
    return writeWorkspaceToPath(selected)
  }

  return {
    currentFilePath,
    savedRevision,
    isBusy,
    isDirty,
    fileName,
    windowTitle,

    syncSavedRevision,
    resetToNew,
    loadTemplateWorkspace,
    restoreRecoveryDraft,
    openPath,
    pickAndOpenFile,
    saveFile,
    saveFileAs
  }
})
