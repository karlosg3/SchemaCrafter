/**
 * Id generation.
 *
 * The parsers mint ids with `Date.now()`, which collides whenever two entities
 * are created inside the same millisecond. These do not.
 */

function randomSuffix(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

export function createId(prefix: string): string {
  return `${prefix}-${randomSuffix()}`
}

/** `Order Items!` -> `order_items`. Used for default schema/table/enum names. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'untitled'
}

/**
 * Returns `base`, or `base_2`, `base_3`... until it is not in `taken`.
 * Used for "new_table", "new_table_2" and for de-duplicating on import.
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base

  let n = 2
  while (used.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}
