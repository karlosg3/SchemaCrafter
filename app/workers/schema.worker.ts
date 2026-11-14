import type { DatabaseProject, ORMTarget } from '../../shared/types/schema'
import type { CodeApplyDiff } from '../../shared/utils/codeDiff'
import { evaluateSchemaDiagnostic } from '../../shared/utils/codeDiagnostic'

export interface SchemaDiagnosticRequest {
  id: number
  code: string
  target: ORMTarget
  project: DatabaseProject
}

export interface SchemaDiagnosticResponse {
  id: number
  diff: CodeApplyDiff | null
  declarations: number
  error: string | null
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SchemaDiagnosticRequest>) => void) | null
  postMessage: (message: SchemaDiagnosticResponse) => void
}

workerScope.onmessage = (event) => {
  const { id, code, target, project } = event.data
  const result = evaluateSchemaDiagnostic(code, target, project)
  workerScope.postMessage({ id, ...result })
}
