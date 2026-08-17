import { describe, expect, it } from 'vitest'
import { generateCodeForTarget } from '#shared/generators/index'
import { parseCodeToProject } from '#shared/parsers/index'
import { migrateV1ToWorkspace } from '#shared/utils/migrations'
import { applyParsedProject, toDatabaseProject } from '#shared/utils/projection'
import { TARGETS, TEMPLATES, normalize } from './fixtures'

/**
 * The adapter's contract: normalizing a DatabaseProject into the Workspace and
 * projecting it back must not change anything the generators read.
 *
 * If this holds, the 5 generators and 4 parsers can stay untouched while the
 * app moves to the normalized store.
 */
describe('toDatabaseProject', () => {
  for (const [name, project] of TEMPLATES) {
    it(`${name}: survives a workspace round trip unchanged`, () => {
      const ws = migrateV1ToWorkspace([project])
      const back = toDatabaseProject(ws, project.id)

      expect(normalize(back)).toEqual(normalize(project))
    })

    it(`${name}: produces byte-identical code for every target`, () => {
      const ws = migrateV1ToWorkspace([project])
      const back = toDatabaseProject(ws, project.id)

      for (const target of TARGETS) {
        expect(generateCodeForTarget(back, target), target)
          .toBe(generateCodeForTarget(project, target))
      }
    })
  }

  it('keeps databases isolated from each other', () => {
    const [, ecommerce] = TEMPLATES[0]!
    const [, saas] = TEMPLATES[1]!
    const ws = migrateV1ToWorkspace([ecommerce, saas])

    expect(normalize(toDatabaseProject(ws, ecommerce.id))).toEqual(normalize(ecommerce))
    expect(normalize(toDatabaseProject(ws, saas.id))).toEqual(normalize(saas))
  })

  it('throws on an unknown database id', () => {
    const ws = migrateV1ToWorkspace([TEMPLATES[0]![1]])
    expect(() => toDatabaseProject(ws, 'nope')).toThrow(/no database/)
  })
})

describe('applyParsedProject', () => {
  it('writes a parsed project back without touching other databases', () => {
    const [, ecommerce] = TEMPLATES[0]!
    const [, saas] = TEMPLATES[1]!
    const ws = migrateV1ToWorkspace([ecommerce, saas])

    const code = generateCodeForTarget(toDatabaseProject(ws, ecommerce.id), 'sql')
    const parsed = parseCodeToProject(code, 'sql', toDatabaseProject(ws, ecommerce.id))
    const next = applyParsedProject(ws, ecommerce.id, parsed)

    // The untouched database is bit-for-bit the same.
    expect(normalize(toDatabaseProject(next, saas.id))).toEqual(normalize(saas))
    // The parsed one now reflects the code.
    expect(normalize(toDatabaseProject(next, ecommerce.id))).toEqual(normalize(parsed))
  })

  it('preserves gradients and sizes the code format cannot express', () => {
    const [, ecommerce] = TEMPLATES[0]!
    let ws = migrateV1ToWorkspace([ecommerce])

    const tableId = 'table-users'
    ws = {
      ...ws,
      tables: {
        ...ws.tables,
        [tableId]: {
          ...ws.tables[tableId]!,
          gradient: ['#ff0000', '#00ff00'],
          size: { width: 400, height: 300 }
        }
      }
    }

    const project = toDatabaseProject(ws, ecommerce.id)
    const next = applyParsedProject(ws, ecommerce.id, project)

    expect(next.tables[tableId]!.gradient).toEqual(['#ff0000', '#00ff00'])
    expect(next.tables[tableId]!.size).toEqual({ width: 400, height: 300 })
  })

  it('does not mutate the input workspace', () => {
    const [, ecommerce] = TEMPLATES[0]!
    const ws = migrateV1ToWorkspace([ecommerce])
    const snapshot = JSON.stringify(ws)

    applyParsedProject(ws, ecommerce.id, toDatabaseProject(ws, ecommerce.id))

    expect(JSON.stringify(ws)).toBe(snapshot)
  })

  it('parks tables under a public schema when the parse found none', () => {
    const [, ecommerce] = TEMPLATES[0]!
    const ws = migrateV1ToWorkspace([ecommerce])

    const next = applyParsedProject(ws, ecommerce.id, {
      id: ecommerce.id,
      name: ecommerce.name,
      engine: 'postgresql',
      schemas: [],
      enums: [],
      tables: [{
        id: 'loose-table',
        name: 'loose',
        position: { x: 0, y: 0 },
        columns: [{ id: 'c1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true }]
      }]
    })

    const projected = toDatabaseProject(next, ecommerce.id)
    expect(projected.schemas).toHaveLength(1)
    expect(projected.schemas[0]!.name).toBe('public')
    expect(projected.tables.map(t => t.name)).toEqual(['loose'])
  })
})
