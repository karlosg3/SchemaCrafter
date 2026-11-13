/**
 * Semantic badge colours per data-type family so columns can be scanned visually
 * at a glance in both dark and light mode.
 */
const NUMERIC_RE = /^(?:INT|BIGINT|SMALLINT|TINYINT|INTEGER|SERIAL|BIGSERIAL|FLOAT|DOUBLE|REAL|DECIMAL|NUMERIC|NUMBER)\b/i
const STRING_RE = /^(?:VARCHAR|TEXT|CHAR|CHARACTER|NVARCHAR|STRING|CITEXT)\b/i
const UUID_RE = /^(?:UUID|GUID)\b/i
const TEMPORAL_RE = /^(?:TIMESTAMP|TIMESTAMPTZ|DATE|TIME|DATETIME|INTERVAL)\b/i
const BOOLEAN_RE = /^(?:BOOL|BOOLEAN)\b/i
const STRUCT_RE = /^(?:JSON|JSONB|ARRAY|BYTEA|BLOB|BINARY)\b/i

export function badgeToneClass(badge: string): string {
  const upper = badge.trim()
  if (UUID_RE.test(upper)) {
    return 'bg-violet-500/12 text-violet-400 border-violet-500/25 [.light_&]:text-violet-700 [.light_&]:bg-violet-500/10'
  }
  if (NUMERIC_RE.test(upper)) {
    return 'bg-amber-500/12 text-amber-400 border-amber-500/25 [.light_&]:text-amber-700 [.light_&]:bg-amber-500/10'
  }
  if (STRING_RE.test(upper)) {
    return 'bg-sky-500/12 text-sky-400 border-sky-500/25 [.light_&]:text-sky-700 [.light_&]:bg-sky-500/10'
  }
  if (TEMPORAL_RE.test(upper)) {
    return 'bg-emerald-500/12 text-emerald-400 border-emerald-500/25 [.light_&]:text-emerald-700 [.light_&]:bg-emerald-500/10'
  }
  if (BOOLEAN_RE.test(upper)) {
    return 'bg-rose-500/12 text-rose-400 border-rose-500/25 [.light_&]:text-rose-700 [.light_&]:bg-rose-500/10'
  }
  if (STRUCT_RE.test(upper)) {
    return 'bg-cyan-500/12 text-cyan-400 border-cyan-500/25 [.light_&]:text-cyan-700 [.light_&]:bg-cyan-500/10'
  }
  return 'bg-fuchsia-500/10 text-ink-muted border-line-panel'
}
