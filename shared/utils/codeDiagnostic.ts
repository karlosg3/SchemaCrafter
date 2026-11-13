import type { DatabaseProject, ORMTarget } from '../types/schema'
import { parseCodeToProject } from '../parsers/index'
import type { CodeApplyDiff } from './codeDiff'
import { countDeclarations, diffProjects } from './codeDiff'

export interface SchemaDiagnosticOutput {
  diff: CodeApplyDiff | null
  declarations: number
  error: string | null
}

/**
 * Pure diagnostic evaluation used inside the Web Worker (and synchronously when
 * Workers are unavailable). Never mutates store state.
 */
export function evaluateSchemaDiagnostic(
  code: string,
  target: ORMTarget,
  project: DatabaseProject
): SchemaDiagnosticOutput {
  const declarations = countDeclarations(code, target)
  try {
    const parsed = parseCodeToProject(code, target, project)
    return {
      diff: diffProjects(project, parsed),
      declarations,
      error: null
    }
  } catch (error) {
    return {
      diff: null,
      declarations,
      error: error instanceof Error ? error.message : 'Could not parse this code.'
    }
  }
}
