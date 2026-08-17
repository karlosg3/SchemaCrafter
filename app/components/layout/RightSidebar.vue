<script setup lang="ts">
import type { DatabaseEngine, ORMTarget } from '#shared/types/schema'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'
import { generateCodeForTarget } from '#shared/generators/index'

const ui = useUiStore()
const workspace = useWorkspaceStore()

const ENGINES: { label: string, value: DatabaseEngine }[] = [
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'SQLite', value: 'sqlite' }
]

const TARGETS: { label: string, value: ORMTarget, lang: string }[] = [
  { label: 'MikroORM', value: 'mikroorm', lang: 'typescript' },
  { label: 'Prisma', value: 'prisma', lang: 'prisma' },
  { label: 'DrizzleORM', value: 'drizzle', lang: 'typescript' },
  { label: 'TypeORM', value: 'typeorm', lang: 'typescript' },
  { label: 'Raw SQL', value: 'sql', lang: 'sql' }
]

const engineModel = computed({
  get: () => ui.engine,
  set: (value: DatabaseEngine) => ui.setEngine(value)
})

const targetModel = computed({
  get: () => ui.state.codeTarget,
  set: (value: ORMTarget) => ui.setCodeTarget(value)
})

/**
 * Read-only preview for now. The CodeMirror editor and the Apply-gated
 * write-back land in P6; nothing here can modify the canvas.
 */
const code = computed(() => {
  if (!ui.activeDbId) return ''
  try {
    return generateCodeForTarget(workspace.projectFor(ui.activeDbId), ui.state.codeTarget)
  } catch (error) {
    console.error('Failed to generate code:', error)
    return ''
  }
})

const lines = computed(() => code.value.split('\n'))
const lang = computed(() => TARGETS.find(t => t.value === ui.state.codeTarget)?.lang ?? 'text')

const toast = useToast()

/**
 * Audit CE-10: the React app fired confetti on the same tick it called
 * `writeText`, so a denied permission still celebrated and copied nothing.
 */
async function copy() {
  if (!code.value) return
  if (!await copyText(code.value)) {
    toast.add({ title: 'Could not copy', description: 'Clipboard access was denied.', color: 'error' })
    return
  }
  toast.add({ title: 'Copied to clipboard', color: 'success' })
  const { default: confetti } = await import('canvas-confetti')
  confetti({ particleCount: 60, spread: 55, origin: { x: 0.85, y: 0.9 }, disableForReducedMotion: true })
}

function download() {
  const dbId = ui.activeDbId
  if (!dbId || !code.value) return
  const name = workspace.database(dbId)?.name ?? 'schema'
  downloadText(codeFileName(name, ui.state.codeTarget), code.value)
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
          :items="TARGETS"
          value-key="value"
          size="xs"
          class="w-28"
          aria-label="ORM target"
        />
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 min-h-0 overflow-auto scrollbar-thin bg-surface-code">
      <div class="flex min-h-full font-mono text-xs leading-5">
        <pre
          aria-hidden="true"
          class="shrink-0 select-none py-3 px-3 text-right text-ink-gutter"
        >{{ lines.map((_, i) => i + 1).join('\n') }}</pre>
        <pre data-code-body class="flex-1 py-3 pr-3 text-ink-code whitespace-pre">{{ code }}</pre>
      </div>
    </div>

    <!-- Footer: sync state, language, line count, actions -->
    <div class="h-9 shrink-0 flex items-center gap-2 px-3 border-t-2 border-line-chrome">
      <span class="flex items-center gap-1.5 text-[10.5px] text-ink-dim">
        <span class="size-1.5 rounded-full bg-sync-ok" />
        Synced
      </span>
      <span class="text-[10.5px] text-ink-faint font-mono">{{ lang }}</span>
      <span class="text-[10.5px] text-ink-faint font-mono">{{ lines.length }} lines</span>

      <div class="ml-auto flex items-center gap-0.5">
        <UButton
          icon="i-ph-copy"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Copy code"
          :disabled="!code"
          @click="copy()"
        />
        <UButton
          icon="i-ph-download-simple"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Download file"
          :disabled="!code"
          @click="download()"
        />
      </div>
    </div>
  </div>
</template>
