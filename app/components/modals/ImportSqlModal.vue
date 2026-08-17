<script setup lang="ts">
import type { DatabaseProject } from '#shared/types/schema'
import { mergeImportedSql } from '#shared/utils/importSql'

const props = defineProps<{
  /** The database the DDL will be merged into. */
  project: DatabaseProject
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [sql: string | null], 'after:leave': [] }>()

const SAMPLE = `CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
  id INT PRIMARY KEY,
  title VARCHAR NOT NULL,
  content TEXT,
  author_id UUID
);`

const sql = ref('')

const close = (value: string | null) => emit('close', value)
useModalDismiss(open, close, null)

// Debounced so a long DDL paste is not re-parsed on every keystroke.
const debounced = refDebounced(sql, 250)

/**
 * A dry run of the same merge the caller will perform, so the modal can say
 * what is about to happen before it happens.
 */
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

function submit() {
  if (canSubmit.value) close(sql.value)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import SQL"
    description="Paste CREATE TABLE statements. Tables that already exist are refreshed in place; everything else is left alone."
    :ui="{ content: 'max-w-2xl' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="import-form" class="space-y-3" @submit.prevent="submit">
        <UTextarea
          v-model="sql"
          :rows="14"
          autofocus
          :placeholder="SAMPLE"
          class="w-full font-mono text-xs"
          aria-label="SQL DDL"
        />

        <p v-if="preview && 'error' in preview" class="text-[11.5px] text-red-400">
          {{ preview.error }}
        </p>
        <p v-else-if="preview" class="text-[11.5px] text-ink-dim font-mono">
          <span v-if="preview.added.length" class="text-accent-400">+{{ preview.added.length }} new</span>
          <span v-if="preview.added.length && preview.updated.length"> · </span>
          <span v-if="preview.updated.length">{{ preview.updated.length }} updated</span>
          <span v-if="!preview.added.length && !preview.updated.length">No CREATE TABLE statements found</span>
        </p>
        <p v-else class="text-[11.5px] text-ink-faint">
          Nothing to import yet.
        </p>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton label="Import" type="submit" form="import-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
