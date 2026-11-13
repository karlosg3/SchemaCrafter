import { defineStore } from 'pinia'
import { slugify } from '#shared/utils/ids'
import {
  PROJECT_FILE_EXTENSION,
  fileNameFromPath,
  parseProjectFile,
  serializeProjectFile
} from '#shared/utils/projectFile'
import {
  pickOpenProjectFile,
  pickSaveProjectFile,
  readProjectFile,
  writeProjectFile
} from '~/utils/desktopFiles'
import { useUiStore } from './ui'
import { useWorkspaceStore } from './workspace'

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

  const isDirty = computed(() => workspaceStore.revision !== savedRevision.value)
  const fileName = computed(() =>
    currentFilePath.value ? fileNameFromPath(currentFilePath.value) : 'Untitled'
  )
  const windowTitle = computed(() =>
    `${isDirty.value ? '• ' : ''}${fileName.value} — SchemaCrafter`
  )

  function syncSavedRevision(): void {
    savedRevision.value = workspaceStore.revision
  }

  function resetToNew(): void {
    workspaceStore.hydrateDesktopEmpty()
    currentFilePath.value = null
    syncSavedRevision()
  }

  async function openPath(path: string): Promise<DesktopFileOpResult> {
    if (isBusy.value) return { ok: false, cancelled: true }

    isBusy.value = true
    try {
      const raw = await readProjectFile(path)
      const parsed = parseProjectFile(raw)
      if (!parsed.ok) {
        return { ok: false, error: parsed.error }
      }

      workspaceStore.loadExternalWorkspace(parsed.workspace)
      if (parsed.migratedFromLegacy) {
        // Keep migrated legacy/single-project JSON exports dirty with no target path
        // so Save prompts for a `.schemacrafter` destination instead of overwriting them.
        currentFilePath.value = null
        savedRevision.value = workspaceStore.revision - 1
      } else {
        currentFilePath.value = path
        syncSavedRevision()
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
    const selected = await pickOpenProjectFile()
    if (!selected) return { ok: false, cancelled: true }
    return openPath(selected)
  }

  async function writeWorkspaceToPath(path: string): Promise<DesktopFileOpResult> {
    isBusy.value = true
    try {
      await writeProjectFile(path, serializeProjectFile(workspaceStore.workspace))
      currentFilePath.value = path
      syncSavedRevision()
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
    openPath,
    pickAndOpenFile,
    saveFile,
    saveFileAs
  }
})
