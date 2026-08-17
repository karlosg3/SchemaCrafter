/**
 * Audit CE-10: the React app fired confetti on the same tick it called
 * `writeText`, so a denied clipboard permission still produced a celebration
 * and no copy. Callers await this and decide afterwards.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
