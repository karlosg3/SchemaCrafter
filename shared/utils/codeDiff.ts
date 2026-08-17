import type { DatabaseProject, ORMTarget } from '../types/schema'

/**
 * How many table declarations the code actually contains.
 *
 * The parsers fall back to the current project's tables when they recognise
 * nothing — `parsePrismaToProject` ends with
 * `tables: mergedTables.length > 0 ? mergedTables : currentProject.tables`.
 * That is reasonable for the parsers (never hand back an empty schema) but it
 * means the code panel cannot tell "no change" from "this is not Prisma at
 * all": both come back identical to the canvas. Counting declarations in the
 * text answers that without touching the parsers, whose behaviour is audit
 * Phase 3/4 territory.
 */
const DECLARATION: Record<ORMTarget, RegExp> = {
  prisma: /\bmodel\s+\w+\s*\{/g,
  sql: /\bCREATE\s+TABLE\b/gi,
  drizzle: /\b(?:pg|mysql|sqlite)Table\s*\(/g,
  typeorm: /@Entity\s*\(/g,
  mikroorm: /@Entity\s*\(/g
}

export function countDeclarations(code: string, target: ORMTarget): number {
  return code.match(DECLARATION[target])?.length ?? 0
}

/**
 * What applying parsed code would do to a database.
 *
 * Applying replaces the database wholesale — the code *is* the schema, which is
 * the right contract for a round trip but means anything the format cannot
 * express disappears. This makes that visible before the write rather than
 * after, which is the other half of audit PAR-9: the React app applied on a
 * 400ms debounce while the user was still typing, with no gate and no warning.
 */
export interface CodeApplyDiff {
  added: string[]
  removed: string[]
  kept: string[]
  /** True when the parse produced no tables at all. */
  isEmpty: boolean
}

export function diffProjects(current: DatabaseProject, parsed: DatabaseProject): CodeApplyDiff {
  const before = new Set(current.tables.map(t => t.name))
  const after = new Set(parsed.tables.map(t => t.name))

  return {
    added: [...after].filter(name => !before.has(name)).sort(),
    removed: [...before].filter(name => !after.has(name)).sort(),
    kept: [...after].filter(name => before.has(name)).sort(),
    isEmpty: after.size === 0
  }
}
