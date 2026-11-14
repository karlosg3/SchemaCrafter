<script setup lang="ts">
import type { Column, DataType, ForeignKeyAction } from '#shared/types/schema'
import { slugify } from '#shared/utils/ids'

export type ColumnDraft = Omit<Column, 'id'>

export interface FkColumnOption {
  id: string
  name: string
  type: DataType
  isPrimaryKey: boolean
  isUnique: boolean
}

export interface FkTableOption {
  id: string
  name: string
  columns: FkColumnOption[]
}

const props = defineProps<{
  title: string
  submitLabel: string
  draft: ColumnDraft
  /** Candidate FK tables in the same database (including self for self-FKs). */
  tables: FkTableOption[]
  /** Enums in the column's own schema — names may repeat across schemas. */
  enums: { name: string, values: string[] }[]
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [draft: ColumnDraft | null], 'after:leave': [] }>()

const TYPES: DataType[] = [
  'INT', 'BIGINT', 'VARCHAR', 'TEXT', 'BOOLEAN', 'UUID',
  'DECIMAL', 'FLOAT', 'TIMESTAMP', 'DATE', 'JSON', 'ENUM'
]

const FK_ACTIONS: ForeignKeyAction[] = ['CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION']

/** Only integer columns can be auto-incremented. */
const COUNTER_TYPES: DataType[] = ['INT', 'BIGINT']

const local = ref<ColumnDraft>(clone(props.draft))
const hasFk = ref(!!props.draft.foreignKey)
let syncingFromProps = false

watch(() => props.draft, async (next) => {
  syncingFromProps = true
  local.value = clone(next)
  hasFk.value = !!next.foreignKey
  await nextTick()
  syncingFromProps = false
}, { deep: true })

function clone(draft: ColumnDraft): ColumnDraft {
  return { ...draft, foreignKey: draft.foreignKey ? { ...draft.foreignKey } : undefined }
}

const close = (draft: ColumnDraft | null) => emit('close', draft)
useModalDismiss(open, close, null)

const isEnum = computed(() => local.value.type === 'ENUM')
const isVarchar = computed(() => local.value.type === 'VARCHAR')
const isDecimal = computed(() => local.value.type === 'DECIMAL')
const canAutoIncrement = computed(() => COUNTER_TYPES.includes(local.value.type))
const typePreview = computed(() => {
  if (isVarchar.value && local.value.length) return `VARCHAR(${local.value.length})`
  if (isDecimal.value && (local.value.precision !== undefined || local.value.scale !== undefined)) {
    return `DECIMAL(${local.value.precision ?? 10},${local.value.scale ?? 2})`
  }
  return local.value.type
})
const normalizedName = computed(() => local.value.name.trim() ? slugify(local.value.name) : '')
const showNormalizedHint = computed(() => !!normalizedName.value && normalizedName.value !== local.value.name)

const selectedEnum = computed(() => props.enums.find(e => e.name === local.value.enumName))
const enumItems = computed(() => props.enums.map(e => ({ label: e.name, value: e.name })))
const tableItems = computed(() => props.tables.map(t => ({ label: t.name, value: t.id })))

/** Mirrors workspace.canRelate(): matching type + primary key or unique target column. */
const targetTable = computed(() => props.tables.find(t => t.id === local.value.foreignKey?.targetTableId))
const targetColumnItems = computed(() => {
  return (targetTable.value?.columns ?? [])
    .filter(c => c.type === local.value.type && (c.isPrimaryKey || c.isUnique))
    .map(c => ({ label: `${c.name} (${c.isPrimaryKey ? 'PK' : 'UQ'})`, value: c.id }))
})
const targetColumnName = computed(() =>
  targetTable.value?.columns.find(c => c.id === local.value.foreignKey?.targetColumnId)?.name ?? ''
)

watch(() => local.value.isPrimaryKey, (isPk) => {
  if (syncingFromProps || !isPk) return
  local.value.isNullable = false
  local.value.isIndexed = false
})

watch(() => local.value.type, (next, prev) => {
  if (syncingFromProps || next === prev) return
  if (!isEnum.value) local.value.enumName = undefined
  if (!isVarchar.value) local.value.length = undefined
  if (!isDecimal.value) {
    local.value.precision = undefined
    local.value.scale = undefined
  }
  if (!canAutoIncrement.value) local.value.isAutoIncrement = false
  if (local.value.foreignKey) local.value.foreignKey.targetColumnId = ''
})

watch(hasFk, (value) => {
  if (syncingFromProps) return
  local.value.foreignKey = value
    ? { targetTableId: '', targetColumnId: '', onDelete: 'CASCADE', onUpdate: 'NO ACTION' }
    : undefined
})

watch(() => local.value.foreignKey?.targetTableId, (next, prev) => {
  if (syncingFromProps || next === prev) return
  if (local.value.foreignKey) local.value.foreignKey.targetColumnId = ''
})

const canSubmit = computed(() => {
  if (local.value.name.trim().length === 0) return false
  if (isEnum.value && !local.value.enumName) return false
  if (hasFk.value) {
    const fk = local.value.foreignKey
    if (!fk?.targetTableId || !fk.targetColumnId) return false
  }
  return true
})

function toggleFlag(key: 'isPrimaryKey' | 'isNullable' | 'isUnique' | 'isIndexed' | 'isAutoIncrement') {
  if (key === 'isNullable' && local.value.isPrimaryKey) return
  if (key === 'isIndexed' && local.value.isPrimaryKey) return
  if (key === 'isAutoIncrement' && !canAutoIncrement.value) return
  local.value[key] = !local.value[key]
}

function normalizePositiveInt(value: unknown, min = 1): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined
  const num = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isInteger(num) && num >= min ? num : undefined
}

function submit() {
  if (!canSubmit.value) return
  const defaultValue = local.value.defaultValue?.trim()
  close({
    ...local.value,
    length: isVarchar.value ? normalizePositiveInt(local.value.length, 1) : undefined,
    precision: isDecimal.value ? normalizePositiveInt(local.value.precision, 1) : undefined,
    scale: isDecimal.value ? normalizePositiveInt(local.value.scale, 0) : undefined,
    defaultValue: defaultValue || undefined,
    enumName: isEnum.value ? local.value.enumName : undefined,
    foreignKey: hasFk.value ? local.value.foreignKey : undefined
  })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    description="Configure column schema, constraints, and relations."
    side="right"
    :ui="{ content: 'max-w-md border-s border-line-chrome bg-surface-chrome' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="column-form" class="space-y-5" @submit.prevent="submit">
        <!-- Identity -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
              Identity
            </h3>
            <span
              class="inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10.5px]"
              :class="badgeToneClass(local.type)"
            >
              {{ typePreview }}
            </span>
          </div>

          <UFormField
            label="Column name"
            required
            :hint="showNormalizedHint ? `Saves as ${normalizedName}` : undefined"
          >
            <UInput v-model="local.name" placeholder="e.g. user_id" autofocus class="w-full font-mono" />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Data type">
              <USelect v-model="local.type" :items="TYPES" class="w-full font-mono" />
            </UFormField>

            <UFormField v-if="isEnum" label="Enum" required>
              <USelect
                v-model="local.enumName"
                :items="enumItems"
                value-key="value"
                placeholder="Pick an enum"
                class="w-full font-mono"
              />
            </UFormField>

            <UFormField v-else label="Default value">
              <UInput v-model="local.defaultValue" placeholder="Optional" class="w-full font-mono" />
            </UFormField>
          </div>

          <UFormField v-if="isVarchar" label="Max length" hint="SQL default: 255">
            <UInput
              v-model.number="local.length"
              type="number"
              min="1"
              max="65535"
              placeholder="255"
              class="w-full font-mono"
            />
          </UFormField>

          <div v-if="isDecimal" class="grid grid-cols-2 gap-3">
            <UFormField label="Precision" hint="Total digits (default 10)">
              <UInput
                v-model.number="local.precision"
                type="number"
                min="1"
                max="65"
                placeholder="10"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField label="Scale" hint="Decimal places (default 2)">
              <UInput
                v-model.number="local.scale"
                type="number"
                min="0"
                max="30"
                placeholder="2"
                class="w-full font-mono"
              />
            </UFormField>
          </div>

          <UFormField v-if="isEnum" label="Default value">
            <USelect
              v-model="local.defaultValue"
              :items="selectedEnum?.values ?? []"
              placeholder="Optional"
              class="w-full font-mono"
            />
          </UFormField>
        </section>

        <!-- Constraints -->
        <section class="space-y-2.5 pt-2 border-t border-line-chrome">
          <h3 class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
            Constraints
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
              :class="local.isPrimaryKey
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-300 [.light_&]:text-amber-700'
                : 'border-line-panel bg-surface-raised text-ink-muted hover:text-ink-bright'"
              :aria-pressed="local.isPrimaryKey"
              @click="toggleFlag('isPrimaryKey')"
            >
              <UIcon name="i-ph-key" class="size-3.5" />
              PK
            </button>

            <button
              type="button"
              :disabled="local.isPrimaryKey"
              class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-40"
              :class="local.isNullable
                ? 'border-accent-400/50 bg-accent-500/15 text-accent-300 [.light_&]:text-accent-700'
                : 'border-line-panel bg-surface-raised text-ink-muted hover:text-ink-bright'"
              :aria-pressed="local.isNullable"
              @click="toggleFlag('isNullable')"
            >
              NULL
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
              :class="local.isUnique
                ? 'border-sky-400/50 bg-sky-500/15 text-sky-300 [.light_&]:text-sky-700'
                : 'border-line-panel bg-surface-raised text-ink-muted hover:text-ink-bright'"
              :aria-pressed="local.isUnique"
              @click="toggleFlag('isUnique')"
            >
              UQ
            </button>

            <button
              type="button"
              :disabled="local.isPrimaryKey"
              class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-40"
              :class="local.isIndexed
                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300 [.light_&]:text-emerald-700'
                : 'border-line-panel bg-surface-raised text-ink-muted hover:text-ink-bright'"
              :aria-pressed="local.isIndexed"
              @click="toggleFlag('isIndexed')"
            >
              IDX
            </button>

            <UTooltip text="Only INT and BIGINT columns can auto-increment" :disabled="canAutoIncrement">
              <button
                type="button"
                :disabled="!canAutoIncrement"
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-40"
                :class="local.isAutoIncrement
                  ? 'border-violet-400/50 bg-violet-500/15 text-violet-300 [.light_&]:text-violet-700'
                  : 'border-line-panel bg-surface-raised text-ink-muted hover:text-ink-bright'"
                :aria-pressed="local.isAutoIncrement"
                @click="toggleFlag('isAutoIncrement')"
              >
                AUTO
              </button>
            </UTooltip>
          </div>
        </section>

        <!-- Foreign Key -->
        <section class="space-y-3 pt-2 border-t border-line-chrome">
          <div class="flex items-center justify-between">
            <h3 class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
              Foreign key
            </h3>
            <USwitch v-model="hasFk" size="sm" :disabled="tables.length === 0" aria-label="Toggle foreign key" />
          </div>

          <div v-if="hasFk && local.foreignKey" class="rounded-lg border border-line-panel bg-surface-raised/70 p-3 space-y-3">
            <p
              v-if="targetTable && targetColumnName"
              class="flex items-center gap-1.5 font-mono text-[11px] text-accent-400"
            >
              <span class="truncate">{{ normalizedName || local.name || 'column' }}</span>
              <UIcon name="i-ph-arrow-right" class="size-3 shrink-0" />
              <span class="truncate">{{ targetTable.name }}.{{ targetColumnName }}</span>
            </p>

            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Target table" size="xs" required>
                <USelect
                  v-model="local.foreignKey.targetTableId"
                  :items="tableItems"
                  value-key="value"
                  placeholder="Pick a table"
                  class="w-full font-mono"
                />
              </UFormField>

              <UFormField
                label="Target column"
                size="xs"
                required
                :hint="targetColumnItems.length === 0 ? `No ${local.type} PK/unique column` : undefined"
              >
                <USelect
                  v-model="local.foreignKey.targetColumnId"
                  :items="targetColumnItems"
                  value-key="value"
                  :disabled="!local.foreignKey.targetTableId"
                  placeholder="Pick a column"
                  class="w-full font-mono"
                />
              </UFormField>

              <UFormField label="On delete" size="xs">
                <USelect v-model="local.foreignKey.onDelete" :items="FK_ACTIONS" class="w-full font-mono" />
              </UFormField>

              <UFormField label="On update" size="xs">
                <USelect v-model="local.foreignKey.onUpdate" :items="FK_ACTIONS" class="w-full font-mono" />
              </UFormField>
            </div>
          </div>
          <p v-else class="text-[11.5px] text-ink-faint">
            {{ tables.length === 0 ? 'Create a table with a PK or unique column to reference.' : 'Optional reference to another column.' }}
          </p>
        </section>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton :label="submitLabel" type="submit" form="column-form" :disabled="!canSubmit" />
      </div>
    </template>
  </USlideover>
</template>
