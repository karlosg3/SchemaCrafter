import type { ORMTarget } from '#shared/types/schema'
import { slugify } from '#shared/utils/ids'

/** Extension per target. TypeScript for the three entity-class ORMs. */
const EXTENSION: Record<ORMTarget, string> = {
  sql: 'sql',
  prisma: 'prisma',
  drizzle: 'ts',
  typeorm: 'ts',
  mikroorm: 'ts'
}

/**
 * Audit CE-11: filenames were per-target constants, so MikroORM and TypeORM
 * both wrote `entities.ts` and exporting two projects in a row silently
 * overwrote the first download.
 */
export function codeFileName(projectName: string, target: ORMTarget): string {
  return `${slugify(projectName)}.${target}.${EXTENSION[target]}`
}

export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
