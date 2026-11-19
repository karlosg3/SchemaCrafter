<script setup lang="ts">
import type { DatabaseProject } from '#shared/types/schema'
import { parseCodeToProject } from '#shared/parsers/index'
import { slugify } from '#shared/utils/ids'
import { diffProjectToAlterSql } from '#shared/utils/sqlDiff'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const CodeEditor = defineAsyncComponent(() => import('~/components/code/CodeEditor.vue'))

const open = defineModel<boolean>('open', { default: false })

const ui = useUiStore()
const workspace = useWorkspaceStore()
const toast = useToast()

type BaselineMode = 'saved' | 'database' | 'sql'

const mode = ref<BaselineMode>('saved')
const targetDbId = ref<string>(ui.activeDbId ?? workspace.databases[0]?.id ?? '')
const compareDbId = ref<string>(workspace.databases[0]?.id ?? '')
const baselineSql = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  targetDbId.value = ui.activeDbId ?? workspace.databases[0]?.id ?? ''
  const alternate = workspace.databases.find(d => d.id !== targetDbId.value)
  compareDbId.value = alternate?.id ?? targetDbId.value
})

const dbItems = computed(() =>
  workspace.databases.map(d => ({ label: `${d.name} (${d.engine})`, value: d.id }))
)

const afterProject = computed<DatabaseProject | null>(() => {
  if (!targetDbId.value || !workspace.database(targetDbId.value)) return null
  return workspace.projectFor(targetDbId.value)
})

const beforeProject = computed<DatabaseProject | null>(() => {
  const after = afterProject.value
  if (!after) return null

  if (mode.value === 'saved') {
    return workspace.baselineProjectFor(after.id)
  }
  if (mode.value === 'database') {
    if (!compareDbId.value || !workspace.database(compareDbId.value)) return null
    return workspace.projectFor(compareDbId.value)
  }

  const seed: DatabaseProject = {
    id: after.id,
    name: after.name,
    engine: after.engine,
    schemas: after.schemas.length > 0 ? after.schemas : [{ id: 'schema-public', name: 'public', color: '#265385' }],
    enums: [],
    tables: []
  }
  if (!baselineSql.value.trim()) return seed
  try {
    return parseCodeToProject(baselineSql.value, 'sql', seed)
  } catch {
    return seed
  }
})

const diff = computed(() => {
  if (!beforeProject.value || !afterProject.value) {
    return {
      statements: [] as string[],
      sql: '-- Select a valid target database.',
      summary: { tablesAdded: 0, tablesDropped: 0, tablesRenamed: 0, columnsAdded: 0, columnsDropped: 0, columnsAltered: 0 }
    }
  }
  return diffProjectToAlterSql(beforeProject.value, afterProject.value)
})

async function copySql() {
  try {
    await navigator.clipboard.writeText(diff.value.sql)
    toast.add({ title: 'Copied migration SQL', color: 'success' })
  } catch {
    toast.add({ title: 'Clipboard unavailable', color: 'warning' })
  }
}

function downloadMigration() {
  const name = slugify(afterProject.value?.name ?? 'schema')
  downloadText(`${name}.migration.sql`, diff.value.sql + '\n', 'application/sql')
  toast.add({ title: 'Downloaded migration SQL', color: 'success' })
}

function resetBaseline() {
  workspace.captureBaseline()
  toast.add({ title: 'Baseline updated to current schema', color: 'info' })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="SQL Migration Diff"
    description="Generate incremental ALTER TABLE, CREATE TABLE, and index migration statements."
    :ui="{ content: 'max-w-3xl border border-line-panel bg-[#0E1E35] [.light_&]:bg-surface-block' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="inline-flex rounded-md border border-line-panel bg-surface-root/80 p-0.5">
            <button
              v-for="opt in ([
                { id: 'saved', label: 'Since last save / load' },
                { id: 'database', label: 'Compare database' },
                { id: 'sql', label: 'Paste baseline SQL' }
              ] as const)"
              :key="opt.id"
              type="button"
              class="rounded border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
              :class="mode === opt.id
                ? 'bg-accent-500/20 text-accent-300 border-accent-500/45 [.light_&]:bg-surface-block [.light_&]:text-accent-700 [.light_&]:border-accent-600/35 [.light_&]:shadow-2xs'
                : 'border-transparent text-ink-muted hover:text-ink-bright'"
              @click="mode = opt.id"
            >
              {{ opt.label }}
            </button>
          </div>

          <UButton
            v-if="mode === 'saved'"
            label="Mark current as baseline"
            icon="i-ph-bookmark-simple"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="resetBaseline()"
          />
        </div>

        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField v-if="mode === 'database'" label="Baseline (Before)">
            <USelect v-model="compareDbId" :items="dbItems" value-key="value" class="w-full" />
          </UFormField>

          <UFormField label="Target Database (After)">
            <USelect v-model="targetDbId" :items="dbItems" value-key="value" class="w-full" />
          </UFormField>
        </div>

        <UFormField v-if="mode === 'sql'" label="Baseline SQL DDL (CREATE TABLE)">
          <div class="h-36 rounded-lg border border-line-panel overflow-hidden">
            <CodeEditor v-model="baselineSql" language="sql" :engine="afterProject?.engine ?? 'postgresql'" />
          </div>
        </UFormField>

        <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
          <span class="rounded border border-[#2A7B5B]/45 bg-[#2A7B5B]/16 px-2 py-0.5 text-[#68D3A8] [.light_&]:border-[#1C5941]/35 [.light_&]:bg-[#2A7B5B]/10 [.light_&]:text-[#1B6B4A]">
            +{{ diff.summary.tablesAdded }} tables / +{{ diff.summary.columnsAdded }} cols
          </span>
          <span class="rounded border border-[#D99426]/45 bg-[#D99426]/16 px-2 py-0.5 text-[#F2C15A] [.light_&]:border-[#B47415]/35 [.light_&]:bg-[#D99426]/10 [.light_&]:text-[#8A5406]">
            ~{{ diff.summary.columnsAltered }} altered / ~{{ diff.summary.tablesRenamed }} renamed
          </span>
          <span class="rounded border border-[#A63A50]/45 bg-[#A63A50]/16 px-2 py-0.5 text-[#F29BA7] [.light_&]:border-[#7D273A]/35 [.light_&]:bg-[#A63A50]/10 [.light_&]:text-[#8F2937]">
            -{{ diff.summary.tablesDropped }} tables / -{{ diff.summary.columnsDropped }} cols
          </span>
        </div>

        <div class="h-68 rounded-md border border-line-panel overflow-hidden">
          <CodeEditor :model-value="diff.sql" language="sql" :engine="afterProject?.engine ?? 'postgresql'" readonly />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full gap-2">
        <span class="text-[11px] font-mono tabular-nums text-ink-dim">
          {{ diff.statements.length }} statement{{ diff.statements.length === 1 ? '' : 's' }}
        </span>
        <div class="flex items-center gap-2">
          <UButton label="Copy SQL" icon="i-ph-copy" color="neutral" variant="outline" @click="copySql()" />
          <UButton
            label="Download .sql"
            icon="i-ph-download-simple"
            :disabled="diff.statements.length === 0"
            @click="downloadMigration()"
          />
          <UButton label="Close" color="neutral" variant="ghost" @click="open = false" />
        </div>
      </div>
    </template>
  </UModal>
</template>
