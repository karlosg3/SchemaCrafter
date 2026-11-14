<script setup lang="ts">
import type { DatabaseProject } from '#shared/types/schema'
import { mergeImportedSql } from '#shared/utils/importSql'

const props = defineProps<{
  /** The database the DDL will be merged into. */
  project: DatabaseProject
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [sql: string | null], 'after:leave': [] }>()

const LazyCodeEditor = defineAsyncComponent(() => import('~/components/code/CodeEditor.vue'))
const editorRef = ref<{ getValue: () => string, flush: () => string } | null>(null)

const SAMPLE = `CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
  id INT PRIMARY KEY,
  title VARCHAR NOT NULL,
  content TEXT,
  author_id UUID REFERENCES users(id) ON DELETE CASCADE
);`

const sql = ref('')

const close = (value: string | null) => emit('close', value)
useModalDismiss(open, close, null)

const debounced = refDebounced(sql, 250)

const preview = computed(() => {
  if (!debounced.value.trim()) return null
  try {
    const { added, updated } = mergeImportedSql(props.project, debounced.value)
    return { added, updated }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not parse that SQL.' }
  }
})

const canSubmit = computed(() => {
  const p = preview.value
  return !!p && !('error' in p) && (p.added.length > 0 || p.updated.length > 0)
})

function loadSample() {
  sql.value = SAMPLE
}

function submit() {
  const live = editorRef.value?.flush() ?? sql.value
  if (canSubmit.value || (live.trim() && !preview.value)) close(live)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import SQL"
    description="Paste CREATE TABLE statements. Existing tables are refreshed in place; everything else stays untouched."
    :ui="{ content: 'max-w-2xl border border-line-chrome bg-surface-chrome' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="import-form" class="space-y-3" @submit.prevent="submit">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono text-ink-dim uppercase tracking-[0.06em]">
            SQL Dialect: {{ project.engine }}
          </span>
          <UButton
            label="Load sample SQL"
            icon="i-ph-sparkle"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="loadSample()"
          />
        </div>

        <div class="h-72 rounded-lg border border-line-panel overflow-hidden bg-surface-code">
          <LazyCodeEditor
            v-if="open"
            ref="editorRef"
            :model-value="sql"
            language="sql"
            :engine="project.engine"
            @update:model-value="v => sql = v"
          />
        </div>

        <div v-if="preview && 'error' in preview" class="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-400">
          {{ preview.error }}
        </div>
        <div
          v-else-if="preview"
          class="flex flex-wrap items-center gap-2 rounded-md border border-line-panel bg-surface-raised/60 px-3 py-2 text-[11.5px] font-mono text-ink-dim"
        >
          <span v-if="preview.added.length" class="text-emerald-400 [.light_&]:text-emerald-700">
            +{{ preview.added.length }} new ({{ preview.added.join(', ') }})
          </span>
          <span v-if="preview.updated.length" class="text-sky-400 [.light_&]:text-sky-700">
            ~{{ preview.updated.length }} updated ({{ preview.updated.join(', ') }})
          </span>
          <span v-if="!preview.added.length && !preview.updated.length" class="text-ink-faint">
            No CREATE TABLE statements detected yet.
          </span>
        </div>
        <p v-else class="text-[11.5px] text-ink-faint">
          Paste DDL above or click "Load sample SQL" to preview schema diff.
        </p>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton label="Import tables" icon="i-ph-upload-simple" type="submit" form="import-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
