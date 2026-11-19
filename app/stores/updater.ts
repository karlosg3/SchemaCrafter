import { defineStore } from 'pinia'
import type {
  InstallUpdateResult,
  UpdateCheckResult,
  UpdateProgressEvent
} from '~/desktop/updater'

const DISMISSED_TAG_KEY = 'schemacrafter_dismissed_update_tag'

let desktopUpdaterPromise: Promise<typeof import('~/desktop/updater')> | null = null
function loadDesktopUpdater() {
  return (desktopUpdaterPromise ??= import('~/desktop/updater'))
}

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'installed'
  | 'manual'
  | 'error'

export interface UpdateProgressState {
  downloadedBytes: number
  totalBytes: number | null
  percent: number | null
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx++
  }
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`
}

function readDismissedTag(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(DISMISSED_TAG_KEY) : null
  } catch {
    return null
  }
}

function writeDismissedTag(tag: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (tag) localStorage.setItem(DISMISSED_TAG_KEY, tag)
    else localStorage.removeItem(DISMISSED_TAG_KEY)
  } catch {
    // Ignore storage quota or restricted storage errors.
  }
}

export const useUpdaterStore = defineStore('updater', () => {
  const status = ref<UpdaterStatus>('idle')
  const info = ref<UpdateCheckResult | null>(null)
  const progress = ref<UpdateProgressState>({
    downloadedBytes: 0,
    totalBytes: null,
    percent: null
  })
  const error = ref<string | null>(null)
  const manualInfo = ref<{ downloadedPath: string, installCommand: string, message: string | null } | null>(null)
  const modalOpen = ref(false)
  const dismissedTag = ref<string | null>(readDismissedTag())

  const isBusy = computed(() =>
    status.value === 'checking'
    || status.value === 'downloading'
    || status.value === 'verifying'
    || status.value === 'installing'
  )

  const updateAvailable = computed(() => Boolean(info.value?.updateAvailable))

  const shouldNotify = computed(() =>
    updateAvailable.value
    && info.value !== null
    && dismissedTag.value !== info.value.tag
  )

  function openModal() {
    modalOpen.value = true
  }

  function dismissCurrentUpdate() {
    if (info.value?.tag) {
      dismissedTag.value = info.value.tag
      writeDismissedTag(info.value.tag)
    }
    modalOpen.value = false
  }

  async function checkForUpdates(options?: { silent?: boolean }): Promise<UpdateCheckResult | null> {
    if (isBusy.value) return info.value
    const silent = options?.silent ?? false

    status.value = 'checking'
    error.value = null
    manualInfo.value = null
    if (!silent) modalOpen.value = true

    try {
      const bridge = await loadDesktopUpdater()
      const result = await bridge.checkDesktopUpdates()
      info.value = result
      status.value = result.updateAvailable ? 'available' : 'up-to-date'
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      error.value = msg
      status.value = silent ? 'idle' : 'error'
      return null
    }
  }

  async function installUpdate(): Promise<InstallUpdateResult | null> {
    const current = info.value
    if (!current || !current.assetName || !current.assetUrl || isBusy.value) return null

    status.value = 'downloading'
    error.value = null
    manualInfo.value = null
    progress.value = {
      downloadedBytes: 0,
      totalBytes: current.assetSize,
      percent: 0
    }

    let unlisten: (() => void) | null = null
    try {
      const bridge = await loadDesktopUpdater()
      unlisten = await bridge.listenUpdateProgress((evt: UpdateProgressEvent) => {
        progress.value = {
          downloadedBytes: evt.downloadedBytes,
          totalBytes: evt.totalBytes ?? current.assetSize,
          percent: evt.percent
        }
        if (evt.stage === 'downloading') status.value = 'downloading'
        else if (evt.stage === 'verifying') status.value = 'verifying'
        else if (evt.stage === 'installing') status.value = 'installing'
        else if (evt.stage === 'installed') status.value = 'installed'
      })

      const result = await bridge.installDebUpdate({
        assetName: current.assetName,
        assetUrl: current.assetUrl,
        checksumUrl: current.checksumUrl
      })

      if (result.status === 'installed') {
        status.value = 'installed'
      } else if (result.status === 'cancelled') {
        status.value = 'available'
      } else {
        status.value = 'manual'
        manualInfo.value = {
          downloadedPath: result.downloadedPath ?? '',
          installCommand: result.installCommand ?? '',
          message: result.message
        }
      }
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      status.value = 'error'
      return null
    } finally {
      unlisten?.()
    }
  }

  async function openReleasePage(): Promise<void> {
    const url = info.value?.releaseUrl ?? 'https://github.com/karlosg3/SchemaCrafter/releases/latest'
    const bridge = await loadDesktopUpdater()
    await bridge.openExternalUrl(url)
  }

  async function restartApp(): Promise<void> {
    const bridge = await loadDesktopUpdater()
    await bridge.restartDesktopApp()
  }

  return {
    status,
    info,
    progress,
    error,
    manualInfo,
    modalOpen,
    dismissedTag,
    isBusy,
    updateAvailable,
    shouldNotify,

    openModal,
    dismissCurrentUpdate,
    checkForUpdates,
    installUpdate,
    openReleasePage,
    restartApp
  }
})
