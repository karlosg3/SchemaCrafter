<script setup lang="ts">
import type { Column, DataType, ForeignKeyAction } from '#shared/types/schema'

export type ColumnDraft = Omit<Column, 'id'>

export interface FkTableOption {
  id: string
  name: string
  columns: { id: string, name: string, type: DataType }[]
}

const props = defineProps<{
  title: string
  submitLabel: string
  draft: ColumnDraft
  /** Tables in the same database, minus the one being edited. */
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

watch(() => props.draft, (next) => {
  local.value = clone(next)
  hasFk.value = !!next.foreignKey
}, { deep: true })

function clone(draft: ColumnDraft): ColumnDraft {
  return { ...draft, foreignKey: draft.foreignKey ? { ...draft.foreignKey } : undefined }
}

const close = (draft: ColumnDraft | null) => emit('close', draft)
useModalDismiss(open, close, null)

const isEnum = computed(() => local.value.type === 'ENUM')
const canAutoIncrement = computed(() => COUNTER_TYPES.includes(local.value.type))

const selectedEnum = computed(() => props.enums.find(e => e.name === local.value.enumName))

const enumItems = computed(() => props.enums.map(e => ({ label: e.name, value: e.name })))
const tableItems = computed(() => props.tables.map(t => ({ label: t.name, value: t.id })))

/** A foreign key is only meaningful between columns of the same type. */
const targetColumnItems = computed(() => {
  const table = props.tables.find(t => t.id === local.value.foreignKey?.targetTableId)
  return (table?.columns ?? [])
    .filter(c => c.type === local.value.type)
    .map(c => ({ label: c.name, value: c.id }))
})

// A primary key is implicitly non-null and already indexed; leaving the two
// switches live would let the form describe a column the generators cannot emit.
watch(() => local.value.isPrimaryKey, (isPk) => {
  if (!isPk) return
  local.value.isNullable = false
  local.value.isIndexed = false
})

watch(() => local.value.type, () => {
  if (!isEnum.value) local.value.enumName = undefined
  if (!canAutoIncrement.value) local.value.isAutoIncrement = false
  // The old target column's type no longer matches.
  if (local.value.foreignKey) local.value.foreignKey.targetColumnId = ''
})

watch(hasFk, (value) => {
  local.value.foreignKey = value
    ? { targetTableId: '', targetColumnId: '', onDelete: 'CASCADE', onUpdate: 'NO ACTION' }
    : undefined
})

watch(() => local.value.foreignKey?.targetTableId, () => {
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

function submit() {
  if (!canSubmit.value) return
  const defaultValue = local.value.defaultValue?.trim()
  close({
    ...local.value,
    defaultValue: defaultValue || undefined,
    enumName: isEnum.value ? local.value.enumName : undefined,
    foreignKey: hasFk.value ? local.value.foreignKey : undefined
  })
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-lg' }" @after:leave="emit('after:leave')">
    <template #body>
      <form id="column-form" class="space-y-4" @submit.prevent="submit">
        <UFormField label="Column name" required>
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

        <UFormField v-if="isEnum" label="Default value">
          <USelect
            v-model="local.defaultValue"
            :items="selectedEnum?.values ?? []"
            placeholder="Optional"
            class="w-full font-mono"
          />
        </UFormField>

        <UFormField label="Constraints">
          <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <label class="flex items-center justify-between gap-3 text-[12px] text-ink cursor-pointer">
              Primary key
              <USwitch v-model="local.isPrimaryKey" size="sm" />
            </label>
            <label class="flex items-center justify-between gap-3 text-[12px] text-ink cursor-pointer">
              Nullable
              <USwitch v-model="local.isNullable" size="sm" :disabled="local.isPrimaryKey" />
            </label>
            <label class="flex items-center justify-between gap-3 text-[12px] text-ink cursor-pointer">
              Unique
              <USwitch v-model="local.isUnique" size="sm" />
            </label>
            <label class="flex items-center justify-between gap-3 text-[12px] text-ink cursor-pointer">
              Indexed
              <USwitch v-model="local.isIndexed" size="sm" :disabled="local.isPrimaryKey" />
            </label>
            <!--
              Both of these were `useState` with no setter in ColumnModal.tsx
              (L29 and L36) — rendered, unchangeable, and silently saved at
              their defaults. They are real fields now.
            -->
            <UTooltip text="Only integer columns can auto-increment" :disabled="canAutoIncrement">
              <label class="flex items-center justify-between gap-3 text-[12px] text-ink cursor-pointer w-full">
                Auto-increment
                <USwitch v-model="local.isAutoIncrement" size="sm" :disabled="!canAutoIncrement" />
              </label>
            </UTooltip>
          </div>
        </UFormField>

        <UFormField label="Foreign key">
          <div class="space-y-3">
            <label class="flex items-center justify-between gap-3 text-[12px] text-ink cursor-pointer">
              References another table
              <USwitch v-model="hasFk" size="sm" :disabled="tables.length === 0" />
            </label>

            <div v-if="hasFk && local.foreignKey" class="grid grid-cols-2 gap-3">
              <UFormField label="Table" size="xs" required>
                <USelect
                  v-model="local.foreignKey.targetTableId"
                  :items="tableItems"
                  value-key="value"
                  placeholder="Pick a table"
                  class="w-full font-mono"
                />
              </UFormField>

              <UFormField
                label="Column"
                size="xs"
                required
                :hint="targetColumnItems.length === 0 ? `no ${local.type} column` : undefined"
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
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton :label="submitLabel" type="submit" form="column-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
