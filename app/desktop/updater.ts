import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  tag: string
  updateAvailable: boolean
  releaseUrl: string
  releaseNotes: string
  publishedAt: string | null
  assetName: string | null
  assetUrl: string | null
  assetSize: number | null
  checksumUrl: string | null
  canAutoInstall: boolean
}

export interface InstallUpdateRequest {
  assetName: string
  assetUrl: string
  checksumUrl: string | null
}

export interface UpdateProgressEvent {
  stage: 'downloading' | 'verifying' | 'installing' | 'installed'
  downloadedBytes: number
  totalBytes: number | null
  percent: number | null
}

export interface InstallUpdateResult {
  status: 'installed' | 'cancelled' | 'manual'
  downloadedPath: string | null
  installCommand: string | null
  message: string | null
}

/** Checks GitHub Releases for a newer version of SchemaCrafter. */
export function checkDesktopUpdates(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>('check_for_updates')
}

/** Downloads, SHA-256 verifies, and installs the `.deb` update package on Linux. */
export function installDebUpdate(request: InstallUpdateRequest): Promise<InstallUpdateResult> {
  return invoke<InstallUpdateResult>('install_deb_update', { request })
}

/** Restarts the desktop application to boot into the newly installed binary. */
export async function restartDesktopApp(): Promise<void> {
  await invoke('restart_app')
}

/** Opens an allowlisted external URL (GitHub Release / Netlify) in the default browser. */
export async function openExternalUrl(url: string): Promise<void> {
  await invoke('open_external_url', { url })
}

/** Subscribes to live download / verify / install progress events from Rust. */
export function listenUpdateProgress(
  handler: (event: UpdateProgressEvent) => void
): Promise<() => void> {
  return listen<UpdateProgressEvent>('update-progress', event => handler(event.payload))
}
