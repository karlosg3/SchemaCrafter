<script setup lang="ts">
import type { DatabaseEngine, IndexDefinition } from '#shared/types/schema'
import type { Gradient } from '#shared/types/workspace'
import { GRADIENTS } from '#shared/types/workspace'
import { createId, slugify } from '#shared/utils/ids'

export interface EntityDraft {
  name: string
  gradient: Gradient
  comment: string
  engine?: DatabaseEngine
  schemaId?: string
  indexes?: IndexDefinition[]
}

const props = defineProps<{
  kind: 'database' | 'schema' | 'table'
  title: string
  submitLabel: string
  draft: EntityDraft
  /** Required for tables: the schemas the table may be moved between. */
  schemaOptions?: { label: string, value: string }[]
  /** Column names available on an existing table for building composite indexes. */
  availableColumns?: string[]
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [draft: EntityDraft | null], 'after:leave': [] }>()

const ENGINES: { label: string, value: DatabaseEngine }[] = [
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'SQLite', value: 'sqlite' }
]

const PLACEHOLDER: Record<typeof props.kind, string> = {
  database: 'e.g. Analytics Warehouse',
  schema: 'e.g. billing',
  table: 'e.g. order_items'
}

const KIND_ICON: Record<typeof props.kind, string> = {
  database: 'i-ph-database',
  schema: 'i-ph-folders',
  table: 'i-ph-table'
}

const INDEX_TYPES: NonNullable<IndexDefinition['type']>[] = ['BTREE', 'HASH', 'GIN', 'GIST']

function cloneIndexes(list?: IndexDefinition[]): IndexDefinition[] {
  return (list ?? []).map(i => ({ ...i, columnNames: [...i.columnNames] }))
}

const local = ref<EntityDraft>({
  ...props.draft,
  gradient: [...props.draft.gradient] as Gradient,
  indexes: cloneIndexes(props.draft.indexes)
})
watch(() => props.draft, (next) => {
  local.value = {
    ...next,
    gradient: [...next.gradient] as Gradient,
    indexes: cloneIndexes(next.indexes)
  }
}, { deep: true })

const draftIdxName = ref('')
const draftIdxCols = ref<string[]>([])
const draftIdxUnique = ref(false)
const draftIdxType = ref<NonNullable<IndexDefinition['type']>>('BTREE')

const suggestedIdxName = computed(() => {
  const tbl = slugify(local.value.name) || 'table'
  const cols = draftIdxCols.value.length > 0 ? draftIdxCols.value.join('_') : 'cols'
  return `${draftIdxUnique.value ? 'uq' : 'idx'}_${tbl}_${cols}`
})

function toggleDraftIdxCol(colName: string) {
  const existing = draftIdxCols.value.indexOf(colName)
  if (existing === -1) draftIdxCols.value.push(colName)
  else draftIdxCols.value.splice(existing, 1)
}

function addCompositeIndex() {
  if (draftIdxCols.value.length === 0) return
  const rawName = draftIdxName.value.trim()
  const name = rawName ? slugify(rawName) : suggestedIdxName.value
  const next = local.value.indexes ?? []
  next.push({
    id: createId('idx'),
    name,
    columnNames: [...draftIdxCols.value],
    isUnique: draftIdxUnique.value,
    type: draftIdxType.value
  })
  local.value.indexes = next
  draftIdxName.value = ''
  draftIdxCols.value = []
  draftIdxUnique.value = false
  draftIdxType.value = 'BTREE'
}

function removeCompositeIndex(id: string) {
  local.value.indexes = (local.value.indexes ?? []).filter(i => i.id !== id)
}

const close = (draft: EntityDraft | null) => emit('close', draft)
useModalDismiss(open, close, null)

const canSubmit = computed(() => local.value.name.trim().length > 0)
const normalizedHint = computed(() => {
  if (props.kind === 'database') return undefined
  const raw = local.value.name
  if (!raw.trim()) return undefined
  const slug = slugify(raw)
  return slug !== raw ? `Saves as ${slug}` : undefined
})

function submit() {
  if (!canSubmit.value) return
  close({ ...local.value })
}

function isSelected(gradient: Gradient) {
  return local.value.gradient[0] === gradient[0] && local.value.gradient[1] === gradient[1]
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :ui="{ content: 'max-w-md border border-line-panel bg-[#0E1E35] [.light_&]:bg-surface-block' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="entity-form" class="space-y-4" @submit.prevent="submit">
        <!-- Live preview pill -->
        <div class="flex items-center gap-3 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised px-3 py-2.5">
          <span
            class="size-8 shrink-0 rounded-md grid place-items-center shadow-sm"
            :style="{ background: `linear-gradient(135deg, ${local.gradient[0]}, ${local.gradient[1]})` }"
          >
            <UIcon :name="KIND_ICON[kind]" class="size-4 text-white" />
          </span>
          <div class="min-w-0 flex-1">
            <p
              class="text-[13px] font-semibold text-ink-bright truncate"
              :class="kind === 'database' ? '' : 'font-mono'"
            >
              {{ (normalizedHint ? slugify(local.name) : local.name.trim()) || `Untitled ${kind}` }}
            </p>
            <p class="text-[11px] text-ink-dim truncate">
              {{ kind === 'database' ? (local.engine ?? 'postgresql') : kind }}
            </p>
          </div>
        </div>

        <UFormField
          :label="kind === 'database' ? 'Name' : `${kind === 'schema' ? 'Schema' : 'Table'} name`"
          required
          :hint="normalizedHint"
        >
          <UInput
            v-model="local.name"
            :placeholder="PLACEHOLDER[kind]"
            autofocus
            class="w-full"
            :class="kind === 'database' ? '' : 'font-mono'"
          />
        </UFormField>

        <UFormField v-if="kind === 'database'" label="Engine">
          <USelect v-model="local.engine" :items="ENGINES" value-key="value" class="w-full" />
        </UFormField>

        <UFormField v-if="kind === 'table' && schemaOptions" label="Schema">
          <USelect v-model="local.schemaId" :items="schemaOptions" value-key="value" class="w-full" />
        </UFormField>

        <UFormField label="Accent colour">
          <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
            <button
              v-for="gradient in GRADIENTS"
              :key="gradient[0]"
              type="button"
              class="h-7 w-full rounded-md grid place-items-center ring-offset-2 ring-offset-[#0E1E35] [.light_&]:ring-offset-surface-block transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent-500"
              :class="isSelected(gradient) ? 'ring-2 ring-ink-bright' : 'opacity-85 hover:opacity-100'"
              :style="{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }"
              :aria-label="`Colour ${gradient[0]}`"
              :aria-pressed="isSelected(gradient)"
              @click="local.gradient = [...gradient] as Gradient"
            >
              <UIcon v-if="isSelected(gradient)" name="i-ph-check-bold" class="size-3.5 text-white drop-shadow" />
            </button>
          </div>
        </UFormField>

        <UFormField label="Comment">
          <UTextarea v-model="local.comment" :rows="2" placeholder="Optional notes exported as SQL/ORM comments" class="w-full" />
        </UFormField>

        <section
          v-if="kind === 'table' && availableColumns?.length"
          class="space-y-2.5 pt-2 border-t border-line-chrome"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
              Composite &amp; Custom Indexes
            </h3>
            <span class="font-mono text-[10.5px] text-ink-faint">
              {{ local.indexes?.length ?? 0 }}
            </span>
          </div>

          <div v-if="local.indexes?.length" class="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin pr-0.5">
            <div
              v-for="idx in local.indexes"
              :key="idx.id"
              class="flex items-center gap-2 rounded-md border border-line-panel bg-surface-raised/60 px-2.5 py-1.5"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-[11.5px] text-ink-bright truncate">{{ idx.name }}</span>
                  <span
                    v-if="idx.isUnique"
                    class="rounded border border-[#265385]/45 bg-[#265385]/18 px-1 py-0.5 font-mono text-[9px] text-[#7CC4FA] [.light_&]:border-[#1B5E8A]/30 [.light_&]:bg-[#265385]/10 [.light_&]:text-[#1B5E8A]"
                  >UQ</span>
                  <span
                    v-if="idx.type && idx.type !== 'BTREE'"
                    class="rounded border border-line-panel bg-surface-root px-1 py-0.5 font-mono text-[9px] text-ink-dim"
                  >{{ idx.type }}</span>
                </div>
                <p class="font-mono text-[10.5px] text-ink-muted truncate">
                  ({{ idx.columnNames.join(', ') }})
                </p>
              </div>
              <UButton
                icon="i-ph-trash"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Remove index"
                @click="removeCompositeIndex(idx.id)"
              />
            </div>
          </div>

          <div class="rounded-md border border-line-panel bg-surface-raised/35 p-2.5 space-y-2">
            <div class="flex flex-wrap gap-1">
              <button
                v-for="colName in availableColumns"
                :key="colName"
                type="button"
                class="rounded border px-2 py-0.5 font-mono text-[11px] transition-colors"
                :class="draftIdxCols.includes(colName)
                  ? 'border-accent-500/60 bg-accent-500/15 text-accent-300 [.light_&]:text-accent-700'
                  : 'border-line-panel bg-surface-chrome text-ink-muted hover:text-ink-bright'"
                @click="toggleDraftIdxCol(colName)"
              >
                {{ colName }}
              </button>
            </div>

            <div class="flex items-center gap-2">
              <UInput
                v-model="draftIdxName"
                :placeholder="suggestedIdxName"
                size="xs"
                class="flex-1 font-mono"
              />
              <USelect
                v-model="draftIdxType"
                :items="INDEX_TYPES"
                size="xs"
                class="w-24 font-mono"
              />
              <label class="inline-flex items-center gap-1 text-[11px] text-ink-muted cursor-pointer shrink-0">
                <USwitch v-model="draftIdxUnique" size="xs" />
                UQ
              </label>
              <UButton
                label="Add"
                size="xs"
                variant="soft"
                :disabled="draftIdxCols.length === 0"
                @click="addCompositeIndex"
              />
            </div>
          </div>
        </section>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton :label="submitLabel" type="submit" form="entity-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
