import ConfirmModal from '~/components/modals/ConfirmModal.vue'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
}

/**
 * Confirmation gate for destructive actions.
 *
 * `useOverlay()` returns a promise, so a delete reads as
 * `if (await confirm(...)) store.deleteTable(id)` — no callback threaded
 * through app state, and Escape and the focus trap come from `UModal`
 * (audit UI-2).
 */
export function useConfirm() {
  const overlay = useOverlay()

  return async function confirm(options: ConfirmOptions | string): Promise<boolean> {
    const props = typeof options === 'string' ? { message: options } : options
    const result = await overlay.create(ConfirmModal, { destroyOnClose: true }).open(props)
    return result === true
  }
}
