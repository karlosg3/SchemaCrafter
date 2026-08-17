import type { Ref } from 'vue'

/**
 * `useOverlay()` resolves its promise from the `close` event, but Escape, a
 * backdrop click and the X button only flip the `open` model. Without this the
 * awaited promise would never settle and the caller would hang forever.
 *
 * Calling `close` again once it has already fired is harmless: the overlay
 * clears its resolver after the first call.
 */
export function useModalDismiss<T>(open: Ref<boolean>, close: (value: T) => void, cancelValue: T): void {
  watch(open, (value) => {
    if (!value) close(cancelValue)
  })
}
