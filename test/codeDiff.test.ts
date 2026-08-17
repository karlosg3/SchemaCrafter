import { describe, expect, it } from 'vitest'
import type { DatabaseProject } from '#shared/types/schema'
import { countDeclarations, diffProjects } from '#shared/utils/codeDiff'
import { generateCodeForTarget } from '#shared/generators/index'
import { parseCodeToProject } from '#shared/parsers/index'
import { ECOMMERCE_TEMPLATE } from '#shared/utils/templates'

function projectWith(names: string[]): DatabaseProject {
  return {
    ...ECOMMERCE_TEMPLATE,
    tables: names.map((name, i) => ({
      id: `t-${i}`,
      name,
      schemaId: ECOMMERCE_TEMPLATE.schemas[0]!.id,
      position: { x: 0, y: 0 },
      columns: []
    }))
  }
}

describe('diffProjects', () => {
  it('splits tables into added, removed and kept', () => {
    const diff = diffProjects(projectWith(['users', 'orders']), projectWith(['orders', 'invoices']))

    expect(diff.added).toEqual(['invoices'])
    expect(diff.removed).toEqual(['users'])
    expect(diff.kept).toEqual(['orders'])
    expect(diff.isEmpty).toBe(false)
  })

  it('flags code that parsed to nothing', () => {
    const diff = diffProjects(projectWith(['users']), projectWith([]))

    expect(diff.isEmpty).toBe(true)
    // Everything is on the chopping block, which is what the Apply gate warns on.
    expect(diff.removed).toEqual(['users'])
  })

  it('surfaces what a prisma round trip would do to the canvas', () => {
    const code = generateCodeForTarget(ECOMMERCE_TEMPLATE, 'prisma')
    const parsed = parseCodeToProject(code, 'prisma', ECOMMERCE_TEMPLATE)
    const diff = diffProjects(ECOMMERCE_TEMPLATE, parsed)

    expect(diff.isEmpty).toBe(false)
    expect(diff.kept).toEqual(['categories', 'orders', 'products', 'users'])
    // The generator pascal-cases `order_items` into a model named `OrderItems`
    // and the parser lower-cases it back to `orderitems`, so applying would
    // rename the table. A documented Phase 3/4 loss — see the round-trip
    // snapshot — and exactly the kind of damage the Apply gate warns about
    // before it happens.
    expect(diff.removed).toEqual(['order_items'])
    expect(diff.added).toEqual(['orderitems'])
  })
})

describe('countDeclarations', () => {
  it('counts what each target actually generates', () => {
    for (const target of ['prisma', 'sql', 'drizzle', 'typeorm', 'mikroorm'] as const) {
      const code = generateCodeForTarget(ECOMMERCE_TEMPLATE, target)
      expect(countDeclarations(code, target), target).toBe(ECOMMERCE_TEMPLATE.tables.length)
    }
  })

  it('returns zero for text that is not the target language', () => {
    expect(countDeclarations('}}} not prisma at all (((', 'prisma')).toBe(0)
    expect(countDeclarations('', 'sql')).toBe(0)
    // This is the case diffProjects cannot see: the parser hands back the
    // current tables, so only the text tells you nothing was declared.
    const parsed = parseCodeToProject('garbage', 'prisma', ECOMMERCE_TEMPLATE)
    expect(diffProjects(ECOMMERCE_TEMPLATE, parsed).isEmpty).toBe(false)
    expect(countDeclarations('garbage', 'prisma')).toBe(0)
  })
})
