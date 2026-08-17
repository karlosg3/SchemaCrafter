/**
 * Deleting a computed key off a `Record<string, T>` used as a map is exactly
 * what the workspace's entity tables need, but it trips
 * `@typescript-eslint/no-dynamic-delete`, whose real target is deleting fields
 * off struct-shaped objects. The exception is centralised here rather than
 * sprinkled across every call site.
 */
export function dropKey<T>(record: Record<string, T>, key: string): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete record[key]
}
