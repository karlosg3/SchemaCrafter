/**
 * Confirmation gate for destructive canvas actions.
 *
 * Deliberately a seam: the canvas calls `await confirm(...)` and does not care
 * how the question is asked. P5 swaps the body for `useOverlay()` on a `UModal`,
 * which is also what deletes the React app's `confirmModalData.onConfirm`
 * closure — the app-level state slice that existed only to carry a callback.
 */
export function useConfirm() {
  return async function confirm(message: string): Promise<boolean> {
    if (import.meta.server) return false
    return window.confirm(message)
  }
}
