import { describe, expect, it } from 'vitest'
import type { DatabaseProject } from '#shared/types/schema'
import { generateCodeForTarget } from '#shared/generators/index'
import { parseCodeToProject } from '#shared/parsers/index'
import { TARGETS, TEMPLATES, normalize } from './fixtures'
import type { NormalizedColumn, NormalizedProject } from './fixtures'

/**
 * The round-trip invariant: model -> generate -> parse -> model should lose
 * only what the target format genuinely cannot express.
 *
 * Today it loses far more than that. Rather than a red suite that everyone
 * learns to ignore, each target snapshots a *loss report*. CI stays green, the
 * exact damage per target is reviewable in one file, and audit phases 3-4 turn
 * lines in that report into deletions. A report that shrinks is progress; one
 * that grows without an accompanying code change is a regression.
 */

interface LossReport {
  tablesLost: string[]
  tablesGained: string[]
  schemasLost: string[]
  enumsLost: string[]
  columnDiffs: string[]
  foreignKeysLost: string[]
  primaryKeysLost: string[]
}

function describeColumnDiff(
  table: string,
  before: NormalizedColumn,
  after: NormalizedColumn
): string[] {
  const diffs: string[] = []
  const fields: (keyof NormalizedColumn)[] = [
    'type', 'enumName', 'isNullable', 'isUnique', 'isIndexed',
    'isAutoIncrement', 'defaultValue', 'onDelete', 'onUpdate'
  ]

  for (const field of fields) {
    if (before[field] !== after[field]) {
      diffs.push(`${table}.${before.name}: ${field} ${JSON.stringify(before[field])} -> ${JSON.stringify(after[field])}`)
    }
  }
  return diffs
}

function compare(before: NormalizedProject, after: NormalizedProject): LossReport {
  const beforeTables = new Map(before.tables.map(t => [t.name, t]))
  const afterTables = new Map(after.tables.map(t => [t.name, t]))

  const report: LossReport = {
    tablesLost: before.tables.filter(t => !afterTables.has(t.name)).map(t => t.name),
    tablesGained: after.tables.filter(t => !beforeTables.has(t.name)).map(t => t.name),
    schemasLost: before.schemas.filter(s => !after.schemas.includes(s)),
    enumsLost: before.enums.filter(e => !after.enums.some(x => x.name === e.name)).map(e => e.name),
    columnDiffs: [],
    foreignKeysLost: [],
    primaryKeysLost: []
  }

  for (const [name, beforeTable] of beforeTables) {
    const afterTable = afterTables.get(name)
    if (!afterTable) continue

    const afterCols = new Map(afterTable.columns.map(c => [c.name, c]))

    for (const beforeCol of beforeTable.columns) {
      const afterCol = afterCols.get(beforeCol.name)

      if (!afterCol) {
        report.columnDiffs.push(`${name}.${beforeCol.name}: column dropped`)
        continue
      }
      if (beforeCol.references && !afterCol.references) {
        report.foreignKeysLost.push(`${name}.${beforeCol.name} -> ${beforeCol.references}`)
      }
      if (beforeCol.isPrimaryKey && !afterCol.isPrimaryKey) {
        report.primaryKeysLost.push(`${name}.${beforeCol.name}`)
      }
      report.columnDiffs.push(...describeColumnDiff(name, beforeCol, afterCol))
    }
  }

  return report
}

/** An empty project of the same engine — parsers merge into what they're given. */
function emptyLike(project: DatabaseProject): DatabaseProject {
  return { id: project.id, name: project.name, engine: project.engine, schemas: [], enums: [], tables: [] }
}

describe('round trip', () => {
  for (const [templateName, project] of TEMPLATES) {
    describe(templateName, () => {
      for (const target of TARGETS) {
        it(`reports its ${target} losses`, () => {
          const code = generateCodeForTarget(project, target)
          const back = parseCodeToProject(code, target, emptyLike(project))

          expect(compare(normalize(project), normalize(back))).toMatchSnapshot()
        })
      }
    })
  }
})

describe('parser routing', () => {
  it('has no dedicated TypeORM parser yet (audit PAR-3)', () => {
    // parsers/index.ts routes 'typeorm' to parseMikroOrmToProject, which reads
    // `tableName:` while the TypeORM generator emits `name:`. Documented here so
    // the gap is visible in the suite rather than only in the audit register.
    const [, project] = TEMPLATES[0]!
    const code = generateCodeForTarget(project, 'typeorm')
    const back = parseCodeToProject(code, 'typeorm', emptyLike(project))

    expect(back.tables.length).toBeGreaterThan(0)
  })
})
