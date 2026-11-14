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
    schemas: after.schemas.length > 0 ? after.schemas : [{ id: 'schema-public', name: 'public', color: '#6366f1' }],
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
    :ui="{ content: 'max-w-3xl border border-line-chrome bg-surface-chrome' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="inline-flex rounded-md border border-line-panel bg-surface-raised p-0.5">
            <button
              v-for="opt in ([
                { id: 'saved', label: 'Since last save / load' },
                { id: 'database', label: 'Compare database' },
                { id: 'sql', label: 'Paste baseline SQL' }
              ] as const)"
              :key="opt.id"
              type="button"
              class="rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors"
              :class="mode === opt.id
                ? 'bg-accent-500 text-white'
                : 'text-ink-muted hover:text-ink-bright'"
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

        <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span class="rounded border border-emerald-400/35 bg-emerald-500/12 px-2 py-0.5 text-emerald-300 [.light_&]:text-emerald-700">
            +{{ diff.summary.tablesAdded }} tables / +{{ diff.summary.columnsAdded }} cols
          </span>
          <span class="rounded border border-amber-400/35 bg-amber-500/12 px-2 py-0.5 text-amber-300 [.light_&]:text-amber-700">
            ~{{ diff.summary.columnsAltered }} altered / ~{{ diff.summary.tablesRenamed }} renamed
          </span>
          <span class="rounded border border-rose-400/35 bg-rose-500/12 px-2 py-0.5 text-rose-300 [.light_&]:text-rose-700">
            -{{ diff.summary.tablesDropped }} tables / -{{ diff.summary.columnsDropped }} cols
          </span>
        </div>

        <div class="h-68 rounded-lg border border-line-panel overflow-hidden">
          <CodeEditor :model-value="diff.sql" language="sql" :engine="afterProject?.engine ?? 'postgresql'" readonly />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full gap-2">
        <span class="text-[11px] font-mono text-ink-dim">
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
