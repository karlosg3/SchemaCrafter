import { isTauri } from '@tauri-apps/api/core'

/**
 * True only when running inside the Tauri desktop webview.
 * Web deployments (Netlify) and Vitest unit tests return false.
 */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && isTauri()
}
