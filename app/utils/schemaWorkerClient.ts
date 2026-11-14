import type { DatabaseProject, ORMTarget } from '#shared/types/schema'
import { evaluateSchemaDiagnostic } from '#shared/utils/codeDiagnostic'
import type { SchemaDiagnosticOutput } from '#shared/utils/codeDiagnostic'
import type { SchemaDiagnosticRequest, SchemaDiagnosticResponse } from '~/workers/schema.worker'

/**
 * Runs diagnostic parsing and diffing off the main thread when Web Workers are
 * available, falling back cleanly in Node/happy-dom environments.
 */
export function createSchemaDiagnosticRunner() {
  let worker: Worker | null = null
  let workerDisabled = false
  let nextId = 1
  const pending = new Map<number, {
    resolve: (result: SchemaDiagnosticOutput) => void
    fallback: () => SchemaDiagnosticOutput
  }>()

  function getWorker(): Worker | null {
    if (workerDisabled) return null
    if (worker) return worker
    if (typeof Worker === 'undefined') return null
    try {
      worker = new Worker(new URL('../workers/schema.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<SchemaDiagnosticResponse>) => {
        const { id, diff, declarations, error } = event.data
        const entry = pending.get(id)
        if (!entry) return
        pending.delete(id)
        entry.resolve({ diff, declarations, error })
      }
      worker.onerror = () => {
        workerDisabled = true
        for (const entry of pending.values()) entry.resolve(entry.fallback())
        pending.clear()
        worker?.terminate()
        worker = null
      }
      return worker
    } catch {
      workerDisabled = true
      return null
    }
  }

  function run(code: string, target: ORMTarget, project: DatabaseProject): Promise<SchemaDiagnosticOutput> {
    const id = nextId++
    const activeWorker = getWorker()
    if (!activeWorker) {
      return Promise.resolve(evaluateSchemaDiagnostic(code, target, project))
    }

    pending.clear()

    return new Promise<SchemaDiagnosticOutput>((resolve) => {
      pending.set(id, {
        resolve,
        fallback: () => evaluateSchemaDiagnostic(code, target, project)
      })
      const payload: SchemaDiagnosticRequest = {
        id,
        code,
        target,
        // Strip Vue reactive proxies before structuredClone postMessage transfer.
        project: JSON.parse(JSON.stringify(project)) as DatabaseProject
      }
      try {
        activeWorker.postMessage(payload)
      } catch {
        pending.delete(id)
        resolve(evaluateSchemaDiagnostic(code, target, project))
      }
    })
  }

  function dispose(): void {
    pending.clear()
    worker?.terminate()
    worker = null
  }

  return { run, dispose }
}
