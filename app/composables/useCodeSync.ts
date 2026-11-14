import type { DatabaseEngine, ORMTarget } from '#shared/types/schema'
import { generateCodeForTarget } from '#shared/generators/index'
import { parseCodeToProject } from '#shared/parsers/index'
import type { CodeApplyDiff } from '#shared/utils/codeDiff'
import { diffProjects } from '#shared/utils/codeDiff'
import { createSchemaDiagnosticRunner } from '~/utils/schemaWorkerClient'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

export type SyncStatus = 'synced' | 'editing' | 'invalid'

/** Long enough that parsing never runs mid-token, short enough to feel live. */
const DIAGNOSTIC_DEBOUNCE_MS = 400

function countLinesFast(text: string): number {
  if (!text) return 1
  let lines = 1
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++
  }
  return lines
}

export interface CodeTargetMeta {
  label: string
  value: ORMTarget
  lang: string
}

export const CODE_TARGETS: CodeTargetMeta[] = [
  { label: 'MikroORM', value: 'mikroorm', lang: 'typescript' },
  { label: 'Prisma', value: 'prisma', lang: 'prisma' },
  { label: 'DrizzleORM', value: 'drizzle', lang: 'typescript' },
  { label: 'TypeORM', value: 'typeorm', lang: 'typescript' },
  { label: 'Raw SQL', value: 'sql', lang: 'sql' }
]

export const ENGINES: { label: string, value: DatabaseEngine }[] = [
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'SQLite', value: 'sqlite' }
]

/**
 * Owns the loop between the canvas and the code panel, and closes audit PAR-9.
 *
 * The React version parsed on a 400ms debounce and wrote the result straight
 * into app state, so half-typed code overwrote the canvas. Here the debounced
 * parse only ever produces a diagnostic; `apply()` is the single writer, and it
 * only runs when the user presses the button.
 *
 * The `isUserTypingRef` + `setTimeout(…, 1000)` heuristic that guarded the old
 * one (audit CE-3) and its leaked timer (CE-5) are both gone: `isDirty` is
 * explicit state, and `refDebounced` owns the timer's lifecycle.
 */
export function useCodeSync() {
  const ui = useUiStore()
  const workspace = useWorkspaceStore()
  const confirm = useConfirm()
  const toast = useToast()

  const target = computed(() => ui.state.codeTarget)

  const project = computed(() => ui.activeDbId ? workspace.projectFor(ui.activeDbId) : null)

  const generated = computed(() => {
    if (!project.value) return ''
    try {
      return generateCodeForTarget(project.value, target.value)
    } catch (error) {
      console.error('Failed to generate code:', error)
      return ''
    }
  })

  const draft = ref(generated.value)
  const isDirty = ref(false)
  const lineCount = ref(countLinesFast(draft.value))
  let skipNextContextWatch = false

  const diagnosticRunner = createSchemaDiagnosticRunner()
  onScopeDispose(() => {
    diagnosticRunner.dispose()
    ui.setHasUnappliedCode(false)
  })

  watch(isDirty, dirty => ui.setHasUnappliedCode(dirty), { immediate: true })

  // Reset code draft cleanly when an external workspace load/reset replaces state.
  watch(() => workspace.resetEpoch, () => {
    skipNextContextWatch = true
    isDirty.value = false
    draft.value = generated.value
    lineCount.value = countLinesFast(draft.value)
    queueMicrotask(() => {
      skipNextContextWatch = false
    })
  })

  // The canvas is authoritative while the editor is clean. Once it is dirty the
  // user's text wins until they apply or discard it, so canvas edits made in
  // the meantime are not silently thrown away either way.
  watch(generated, (next) => {
    if (!isDirty.value) {
      draft.value = next
      lineCount.value = countLinesFast(next)
    }
  }, { immediate: true })

  // Switching target or database is a context change: confirm before discarding
  // unapplied code edits so user work isn't wiped silently.
  watch([target, () => ui.activeDbId], async ([nextTarget, nextDbId], [prevTarget, prevDbId]) => {
    if (skipNextContextWatch) return
    if (nextTarget === prevTarget && nextDbId === prevDbId) return

    const prevDbExists = prevDbId ? !!workspace.database(prevDbId) : false
    if (isDirty.value && prevDbExists) {
      const confirmed = await confirm({
        title: 'Discard unapplied changes?',
        message: 'Switching database or ORM target will discard your unapplied edits in the Code panel.',
        confirmLabel: 'Discard & switch'
      })
      if (!confirmed) {
        skipNextContextWatch = true
        if (prevDbId && nextDbId !== prevDbId) ui.selectDatabase(prevDbId)
        if (nextTarget !== prevTarget) ui.setCodeTarget(prevTarget)
        await nextTick()
        skipNextContextWatch = false
        return
      }
    }

    isDirty.value = false
    draft.value = generated.value
    lineCount.value = countLinesFast(draft.value)
  })

  async function requestTargetChange(nextTarget: ORMTarget): Promise<boolean> {
    if (nextTarget === target.value) return true
    if (isDirty.value) {
      const confirmed = await confirm({
        title: 'Discard unapplied changes?',
        message: 'Switching ORM target will discard your unapplied edits in the Code panel.',
        confirmLabel: 'Discard & switch'
      })
      if (!confirmed) return false
    }
    skipNextContextWatch = true
    isDirty.value = false
    ui.setCodeTarget(nextTarget)
    draft.value = generated.value
    lineCount.value = countLinesFast(draft.value)
    await nextTick()
    skipNextContextWatch = false
    return true
  }

  function setDraft(next: string): void {
    draft.value = next
    isDirty.value = next !== generated.value
  }

  function setLineCount(lines: number): void {
    lineCount.value = Math.max(1, lines)
  }

  function markLiveDirty(): void {
    if (!isDirty.value) isDirty.value = true
  }

  function discard(): void {
    isDirty.value = false
    draft.value = generated.value
    lineCount.value = countLinesFast(draft.value)
  }

  // ----------------------------------------------------------- diagnostics

  const debouncedDraft = refDebounced(draft, DIAGNOSTIC_DEBOUNCE_MS)
  const diff = ref<CodeApplyDiff | null>(null)
  const diagError = ref<string | null>(null)
  const declarations = ref(0)
  let diagnosticSeq = 0

  watch(
    [isDirty, debouncedDraft, target, project],
    async ([dirty, text, currentTarget, currentProject]) => {
      const seq = ++diagnosticSeq
      if (!dirty || !currentProject) {
        diff.value = null
        diagError.value = null
        declarations.value = 0
        return
      }
      const result = await diagnosticRunner.run(text, currentTarget, currentProject)
      if (seq !== diagnosticSeq) return
      diff.value = result.diff
      diagError.value = result.error
      declarations.value = result.declarations
    },
    { immediate: true }
  )

  const problem = computed<string | null>(() => {
    if (!isDirty.value) return null
    if (diagError.value) return diagError.value
    if (debouncedDraft.value.trim() && declarations.value === 0) {
      return `No ${target.value === 'sql' ? 'CREATE TABLE statements' : 'table definitions'} found. Check the syntax before applying.`
    }
    return null
  })

  const status = computed<SyncStatus>(() => {
    if (problem.value) return 'invalid'
    return isDirty.value ? 'editing' : 'synced'
  })

  const canApply = computed(() => isDirty.value && !problem.value && !!diff.value)

  // ----------------------------------------------------------------- apply

  async function apply(liveText?: string): Promise<void> {
    const dbId = ui.activeDbId
    if (!dbId || !canApply.value || !project.value) return

    const sourceText = liveText ?? draft.value
    if (sourceText !== draft.value) draft.value = sourceText

    // Parse the live text, not the debounced mirror: applying must act on what
    // is on screen, even if the user hits the button inside the debounce window.
    let next
    try {
      next = parseCodeToProject(sourceText, target.value, project.value)
    } catch (error) {
      toast.add({
        title: 'Could not apply',
        description: error instanceof Error ? error.message : 'The code could not be parsed.',
        color: 'error'
      })
      return
    }

    const summary = diffProjects(project.value, next)
    if (summary.removed.length > 0) {
      const confirmed = await confirm({
        title: 'Apply will remove tables',
        message: `${summary.removed.join(', ')} ${summary.removed.length === 1 ? 'is' : 'are'} not in this code and will be deleted from the canvas.`,
        confirmLabel: 'Apply anyway'
      })
      if (!confirmed) return
    }

    workspace.applyCode(dbId, next)
    isDirty.value = false
    draft.value = generated.value
    lineCount.value = countLinesFast(draft.value)

    toast.add({
      title: 'Applied to canvas',
      description: describe(summary.added.length, summary.removed.length),
      color: 'success'
    })
  }

  function describe(added: number, removed: number): string {
    const parts: string[] = []
    if (added) parts.push(`${added} table${added === 1 ? '' : 's'} added`)
    if (removed) parts.push(`${removed} removed`)
    return parts.length ? parts.join(', ') : 'No structural changes.'
  }

  const language = computed(() =>
    CODE_TARGETS.find(t => t.value === target.value)?.lang ?? 'text'
  )

  return {
    draft,
    setDraft,
    setLineCount,
    markLiveDirty,
    discard,
    apply,
    requestTargetChange,
    isDirty: readonly(isDirty),
    status,
    problem,
    diff,
    canApply,
    language,
    lineCount,
    generated
  }
}
