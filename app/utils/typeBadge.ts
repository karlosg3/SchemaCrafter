/**
 * Calibrated architectural-ink badge colours per data-type family, tuned for
 * WCAG AA contrast in both Blueprint Dark and Drafting Paper Light modes.
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
    return 'bg-[#EA6A38]/14 text-[#F7A37E] border-[#EA6A38]/30 [.light_&]:text-[#A83716] [.light_&]:bg-[#EA6A38]/10 [.light_&]:border-[#C8431F]/28'
  }
  if (NUMERIC_RE.test(upper)) {
    return 'bg-[#D99426]/14 text-[#F2C36B] border-[#D99426]/30 [.light_&]:text-[#8F5907] [.light_&]:bg-[#D99426]/12 [.light_&]:border-[#B47415]/28'
  }
  if (STRING_RE.test(upper)) {
    return 'bg-[#5BA4DA]/14 text-[#93CDF5] border-[#5BA4DA]/30 [.light_&]:text-[#194E78] [.light_&]:bg-[#265385]/10 [.light_&]:border-[#265385]/28'
  }
  if (TEMPORAL_RE.test(upper)) {
    return 'bg-[#2A7B5B]/18 text-[#7AD3AE] border-[#2A7B5B]/35 [.light_&]:text-[#185B40] [.light_&]:bg-[#2A7B5B]/10 [.light_&]:border-[#2A7B5B]/28'
  }
  if (BOOLEAN_RE.test(upper)) {
    return 'bg-[#A63A50]/18 text-[#EC90A0] border-[#A63A50]/35 [.light_&]:text-[#8D2438] [.light_&]:bg-[#A63A50]/10 [.light_&]:border-[#A63A50]/28'
  }
  if (STRUCT_RE.test(upper)) {
    return 'bg-[#257A8C]/18 text-[#7AC7D8] border-[#257A8C]/35 [.light_&]:text-[#165766] [.light_&]:bg-[#257A8C]/10 [.light_&]:border-[#257A8C]/28'
  }
  return 'bg-surface-raised text-ink-muted border-line-panel'
}
