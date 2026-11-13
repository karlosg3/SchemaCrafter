/**
 * True only when running inside the Tauri desktop webview.
 * Uses Tauri's global marker directly so Web builds never pull `@tauri-apps/*`
 * into the entry chunk.
 */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && Boolean((globalThis as { isTauri?: unknown }).isTauri)
}
