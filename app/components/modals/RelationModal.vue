<script setup lang="ts">
import type { ForeignKeyAction } from '#shared/types/schema'

export type RelationModalResult =
  | { action: 'save', onDelete?: ForeignKeyAction, onUpdate?: ForeignKeyAction }
  | { action: 'delete' }

const props = defineProps<{
  sourceLabel: string
  targetLabel: string
  onDelete?: ForeignKeyAction
  onUpdate?: ForeignKeyAction
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [result: RelationModalResult | null], 'after:leave': [] }>()

const FK_ACTIONS: ForeignKeyAction[] = ['CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION']

const localDelete = ref<ForeignKeyAction | undefined>(props.onDelete)
const localUpdate = ref<ForeignKeyAction | undefined>(props.onUpdate)

watch(
  () => [props.onDelete, props.onUpdate] as const,
  ([del, upd]) => {
    localDelete.value = del
    localUpdate.value = upd
  }
)

const close = (result: RelationModalResult | null) => emit('close', result)
useModalDismiss(open, close, null)

function save() {
  close({
    action: 'save',
    onDelete: localDelete.value,
    onUpdate: localUpdate.value
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Foreign key relation"
    description="Configure referential integrity rules or remove this link."
    :ui="{ content: 'max-w-md border border-line-chrome bg-surface-chrome' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="relation-form" class="space-y-4" @submit.prevent="save">
        <div class="rounded-lg border border-line-panel bg-surface-raised/60 px-3 py-2.5 flex items-center gap-2 font-mono text-[12px]">
          <span class="truncate text-ink-bright font-semibold">{{ sourceLabel }}</span>
          <UIcon name="i-ph-arrow-right" class="size-3.5 shrink-0 text-accent-400" />
          <span class="truncate text-accent-400 font-semibold">{{ targetLabel }}</span>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="On delete">
            <USelect
              v-model="localDelete"
              :items="FK_ACTIONS"
              placeholder="Default"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField label="On update">
            <USelect
              v-model="localUpdate"
              :items="FK_ACTIONS"
              placeholder="Default"
              class="w-full font-mono"
            />
          </UFormField>
        </div>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full gap-2">
        <UButton
          label="Remove link"
          icon="i-ph-link-break"
          color="error"
          variant="soft"
          @click="close({ action: 'delete' })"
        />
        <div class="flex items-center gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
          <UButton label="Save" type="submit" form="relation-form" />
        </div>
      </div>
    </template>
  </UModal>
</template>
