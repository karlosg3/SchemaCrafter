<script setup lang="ts">
import type { DatabaseEngine, ORMTarget } from '#shared/types/schema'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const toast = useToast()

const LazyCodeEditor = defineAsyncComponent(() => import('~/components/code/CodeEditor.vue'))
const editorRef = ref<{ getValue: () => string, flush: () => string, openSearch: () => void } | null>(null)
const copiedRecently = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (copyTimer !== null) clearTimeout(copyTimer)
})

const {
  draft,
  setDraft,
  setLineCount,
  markLiveDirty,
  discard,
  apply,
  requestTargetChange,
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

const SHORT_TARGET_LABELS: Record<ORMTarget, string> = {
  mikroorm: 'Mikro',
  prisma: 'Prisma',
  drizzle: 'Drizzle',
  typeorm: 'TypeORM',
  sql: 'SQL'
}

const STATUS = {
  synced: { label: 'Synced', dot: 'bg-sync-ok' },
  editing: { label: 'Editing', dot: 'bg-sync-pending' },
  invalid: { label: 'Invalid', dot: 'bg-red-500' }
} as const

async function copy() {
  const content = editorRef.value?.getValue() ?? draft.value
  if (!content) return
  if (!await copyText(content)) {
    toast.add({ title: 'Could not copy', description: 'Clipboard access was denied.', color: 'error' })
    return
  }
  copiedRecently.value = true
  if (copyTimer !== null) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copiedRecently.value = false
    copyTimer = null
  }, 1500)
  toast.add({ title: 'Copied to clipboard', color: 'success' })
}

function download() {
  const dbId = ui.activeDbId
  const content = editorRef.value?.getValue() ?? draft.value
  if (!dbId || !content) return
  const name = workspace.database(dbId)?.name ?? 'schema'
  downloadText(codeFileName(name, ui.state.codeTarget), content)
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0 bg-surface-chrome">
    <!-- Header: title + engine + search -->
    <div class="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-line-chrome">
      <div class="flex items-center gap-1.5 min-w-0">
        <UIcon name="i-ph-code" class="size-3.5 text-ink-dim shrink-0" />
        <span class="text-[12.5px] font-semibold text-ink-bright">Code</span>
        <UBadge
          v-if="!ui.state.editable"
          label="Read-only"
          color="neutral"
          variant="subtle"
          size="xs"
          class="font-mono"
        />
      </div>

      <div class="ml-auto flex items-center gap-1.5">
        <USelect
          v-model="engineModel"
          :items="ENGINES"
          value-key="value"
          size="xs"
          class="w-28"
          aria-label="Database engine"
        />
        <UTooltip text="Find in code (Ctrl+F)">
          <UButton
            icon="i-ph-magnifying-glass"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Find in code"
            :disabled="!ui.state.rightOpen"
            @click="editorRef?.openSearch()"
          />
        </UTooltip>
      </div>
    </div>

    <!-- Segmented ORM Target Pills -->
    <div class="shrink-0 px-2.5 py-2 border-b border-line-chrome bg-surface-raised/40">
      <div
        class="grid grid-cols-5 gap-1 rounded-lg bg-surface-root/60 p-1 border border-line-row"
        role="tablist"
        aria-label="ORM target"
      >
        <button
          v-for="item in CODE_TARGETS"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="ui.state.codeTarget === item.value"
          class="rounded-md px-1.5 py-1 text-[11px] font-medium truncate transition-colors
                 focus-visible:outline-2 focus-visible:outline-accent-500"
          :class="ui.state.codeTarget === item.value
            ? 'bg-accent-500 text-white shadow-xs'
            : 'text-ink-muted hover:text-ink-bright hover:bg-white/5'"
          @click="void requestTargetChange(item.value)"
        >
          {{ SHORT_TARGET_LABELS[item.value] }}
        </button>
      </div>
    </div>

    <!-- Editor -->
    <div class="flex-1 min-h-0 bg-surface-code" data-code-body>
      <LazyCodeEditor
        v-if="ui.state.rightOpen || isDirty"
        ref="editorRef"
        :model-value="draft"
        :language="language"
        :engine="ui.engine"
        :readonly="!ui.state.editable"
        @update:model-value="setDraft"
        @update:lines="setLineCount"
        @dirty="markLiveDirty"
        @apply="void apply(editorRef?.getValue())"
      />
    </div>

    <!-- Apply gate -->
    <div
      v-if="isDirty"
      class="shrink-0 border-t border-line-chrome bg-surface-raised/60 px-3 py-2.5 space-y-2"
    >
      <p v-if="problem" class="text-[11px] text-red-400 leading-snug">
        {{ problem }}
      </p>
      <div v-else-if="diff" class="flex items-center justify-between text-[11px] font-mono">
        <span class="flex items-center gap-2">
          <span v-if="diff.added.length" class="text-emerald-400 [.light_&]:text-emerald-700">+{{ diff.added.length }} added</span>
          <span v-if="diff.removed.length" class="text-red-400">−{{ diff.removed.length }} removed</span>
          <span class="text-ink-dim">{{ diff.kept.length }} unchanged</span>
        </span>
        <kbd class="hidden sm:inline rounded border border-line-panel bg-surface-chrome px-1.5 py-0.5 text-[10px] text-ink-dim">
          Ctrl+↵
        </kbd>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          label="Apply to canvas"
          icon="i-ph-check"
          size="xs"
          :disabled="!canApply || !ui.state.editable"
          @click="apply(editorRef?.getValue())"
        />
        <UButton label="Discard" color="neutral" variant="ghost" size="xs" @click="discard()" />
      </div>
    </div>

    <!-- Footer: sync state, language, line count, actions -->
    <div class="h-9 shrink-0 flex items-center gap-2 px-3 border-t border-line-chrome">
      <span class="flex items-center gap-1.5 text-[10.5px] text-ink-dim">
        <span class="size-1.5 rounded-full" :class="STATUS[status].dot" />
        {{ STATUS[status].label }}
      </span>
      <span class="text-[10.5px] text-ink-faint font-mono">{{ language }}</span>
      <span class="text-[10.5px] text-ink-faint font-mono">{{ lineCount }} lines</span>

      <div class="ml-auto flex items-center gap-1">
        <UTooltip :text="copiedRecently ? 'Copied!' : 'Copy code'">
          <UButton
            :icon="copiedRecently ? 'i-ph-check' : 'i-ph-copy'"
            :color="copiedRecently ? 'success' : 'neutral'"
            variant="ghost"
            size="xs"
            aria-label="Copy code"
            :disabled="!draft"
            @click="copy()"
          />
        </UTooltip>
        <UTooltip text="Download file">
          <UButton
            icon="i-ph-download-simple"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Download file"
            :disabled="!draft"
            @click="download()"
          />
        </UTooltip>
      </div>
    </div>
  </div>
</template>
