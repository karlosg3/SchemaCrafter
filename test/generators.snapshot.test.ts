import { describe, expect, it } from 'vitest'
import { generateCodeForTarget } from '#shared/generators/index'
import { TARGETS, TEMPLATES } from './fixtures'

/**
 * Golden-file snapshots: 2 templates x 5 targets.
 *
 * These do not assert the output is *correct* — much of it is not, and fixing
 * it is audit phase 3. They assert the output does not change by accident, so
 * that every generator edit shows up as a reviewable diff.
 */
describe('generateCodeForTarget', () => {
  for (const [templateName, project] of TEMPLATES) {
    describe(templateName, () => {
      for (const target of TARGETS) {
        it(`matches the ${target} snapshot`, () => {
          expect(generateCodeForTarget(project, target)).toMatchSnapshot()
        })
      }
    })
  }

  it('falls back to prisma for an unknown target', () => {
    const [, project] = TEMPLATES[0]!
    expect(generateCodeForTarget(project, 'nonsense' as never))
      .toBe(generateCodeForTarget(project, 'prisma'))
  })
})
