<script setup lang="ts">
import type { DatabaseEngine, ORMTarget } from '#shared/types/schema'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const toast = useToast()

// Destructured so each ref auto-unwraps in the template; refs reached through
// an object property do not.
const {
  draft,
  setDraft,
  discard,
  apply,
  isDirty,
  status,
  problem,
  diff,
  canApply,
  language,
  lineCount
} = useCodeSync()

const engineModel = computed({
  get: () => ui.engine,
  set: (value: DatabaseEngine) => ui.setEngine(value)
})

const targetModel = computed({
  get: () => ui.state.codeTarget,
  set: (value: ORMTarget) => ui.setCodeTarget(value)
})

/** The footer dot: amber while editing, red when the code will not parse. */
const STATUS = {
  synced: { label: 'Synced', dot: 'bg-sync-ok' },
  editing: { label: 'Editing', dot: 'bg-sync-pending' },
  invalid: { label: 'Invalid', dot: 'bg-red-500' }
} as const

/**
 * Audit CE-10: the React app fired confetti on the same tick it called
 * `writeText`, so a denied permission still celebrated and copied nothing.
 */
async function copy() {
  if (!draft.value) return
  if (!await copyText(draft.value)) {
    toast.add({ title: 'Could not copy', description: 'Clipboard access was denied.', color: 'error' })
    return
  }
  toast.add({ title: 'Copied to clipboard', color: 'success' })
  const { default: confetti } = await import('canvas-confetti')
  confetti({ particleCount: 60, spread: 55, origin: { x: 0.85, y: 0.9 }, disableForReducedMotion: true })
}

function download() {
  const dbId = ui.activeDbId
  if (!dbId || !draft.value) return
  const name = workspace.database(dbId)?.name ?? 'schema'
  downloadText(codeFileName(name, ui.state.codeTarget), draft.value)
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0 bg-surface-chrome">
    <!-- Header: title + engine / target selects -->
    <div class="h-11 shrink-0 flex items-center gap-2 px-3 border-b-2 border-line-chrome">
      <span class="text-[12.5px] font-semibold text-ink-bright">Code</span>
      <div class="ml-auto flex items-center gap-1.5">
        <USelect
          v-model="engineModel"
          :items="ENGINES"
          value-key="value"
          size="xs"
          class="w-28"
          aria-label="Database engine"
        />
        <USelect
          v-model="targetModel"
          :items="CODE_TARGETS"
          value-key="value"
          size="xs"
          class="w-28"
          aria-label="ORM target"
        />
      </div>
    </div>

    <!-- Editor -->
    <div class="flex-1 min-h-0 bg-surface-code" data-code-body>
      <CodeEditor
        :model-value="draft"
        :language="language"
        :engine="ui.engine"
        @update:model-value="setDraft"
      />
    </div>

    <!--
      The Apply gate (audit PAR-9). Nothing the user types reaches the store
      until this bar is used, so the parse below the editor is advisory only.
    -->
    <div
      v-if="isDirty"
      class="shrink-0 border-t-2 border-line-chrome px-3 py-2 space-y-2"
    >
      <p v-if="problem" class="text-[11px] text-red-400 leading-snug">
        {{ problem }}
      </p>
      <p v-else-if="diff" class="text-[11px] text-ink-dim font-mono">
        <span v-if="diff.added.length" class="text-accent-400">+{{ diff.added.length }}</span>
        <span v-if="diff.removed.length" class="text-red-400 ml-1.5">−{{ diff.removed.length }}</span>
        <span class="ml-1.5">{{ diff.kept.length }} unchanged</span>
      </p>

      <div class="flex items-center gap-2">
        <UButton
          label="Apply to canvas"
          size="xs"
          :disabled="!canApply"
          @click="apply()"
        />
        <UButton label="Discard" color="neutral" variant="ghost" size="xs" @click="discard()" />
      </div>
    </div>

    <!-- Footer: sync state, language, line count, actions -->
    <div class="h-9 shrink-0 flex items-center gap-2 px-3 border-t-2 border-line-chrome">
      <span class="flex items-center gap-1.5 text-[10.5px] text-ink-dim">
        <span class="size-1.5 rounded-full" :class="STATUS[status].dot" />
        {{ STATUS[status].label }}
      </span>
      <span class="text-[10.5px] text-ink-faint font-mono">{{ language }}</span>
      <span class="text-[10.5px] text-ink-faint font-mono">{{ lineCount }} lines</span>

      <div class="ml-auto flex items-center gap-0.5">
        <UButton
          icon="i-ph-copy"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Copy code"
          :disabled="!draft"
          @click="copy()"
        />
        <UButton
          icon="i-ph-download-simple"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Download file"
          :disabled="!draft"
          @click="download()"
        />
      </div>
    </div>
  </div>
</template>
