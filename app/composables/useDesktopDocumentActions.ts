import { PROJECT_FILE_EXTENSION } from '#shared/utils/projectFile'
import type { DesktopFileOpResult } from '~/stores/desktopDocument'
import { useDesktopDocumentStore } from '~/stores/desktopDocument'

/**
 * Coordinates desktop document actions with unsaved-change confirmations and toasts.
 */
export function useDesktopDocumentActions() {
  const doc = useDesktopDocumentStore()
  const confirm = useConfirm()
  const toast = useToast()

  async function confirmDiscard(actionLabel: string): Promise<boolean> {
    if (!doc.isDirty) return true
    return confirm({
      title: 'Unsaved changes',
      message: `You have unsaved changes in "${doc.fileName}". Discard them and ${actionLabel}?`,
      confirmLabel: 'Discard'
    })
  }

  function reportOpenResult(result: DesktopFileOpResult): boolean {
    if (result.cancelled) return false
    if (!result.ok) {
      toast.add({
        title: 'Could not open project file',
        description: result.error,
        color: 'error'
      })
      return false
    }
    if (result.migratedFromLegacy) {
      toast.add({
        title: 'Imported project JSON',
        description: `Save as a .${PROJECT_FILE_EXTENSION} file to keep your workspace.`,
        color: 'info'
      })
    }
    return true
  }

  function reportSaveResult(result: DesktopFileOpResult): boolean {
    if (result.cancelled) return false
    if (!result.ok) {
      toast.add({
        title: 'Failed to save file',
        description: result.error,
        color: 'error'
      })
      return false
    }
    toast.add({ title: `Saved ${result.fileName ?? doc.fileName}`, color: 'success' })
    return true
  }

  async function newFile(): Promise<boolean> {
    if (doc.isBusy || !(await confirmDiscard('create a new project'))) return false
    doc.resetToNew()
    return true
  }

  async function openFile(): Promise<boolean> {
    if (doc.isBusy || !(await confirmDiscard('open another file'))) return false
    return reportOpenResult(await doc.pickAndOpenFile())
  }

  async function openPath(path: string, options?: { skipDirtyCheck?: boolean }): Promise<boolean> {
    if (doc.isBusy) return false
    if (!options?.skipDirtyCheck && !(await confirmDiscard('open another file'))) return false
    return reportOpenResult(await doc.openPath(path))
  }

  async function saveFile(): Promise<boolean> {
    return reportSaveResult(await doc.saveFile())
  }

  async function saveFileAs(): Promise<boolean> {
    return reportSaveResult(await doc.saveFileAs())
  }

  return {
    newFile,
    openFile,
    openPath,
    saveFile,
    saveFileAs
  }
}
