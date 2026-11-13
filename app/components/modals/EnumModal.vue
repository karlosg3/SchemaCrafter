<script setup lang="ts">
export interface EnumDraft {
  name: string
  values: string[]
}

const props = defineProps<{
  title: string
  submitLabel: string
  draft: EnumDraft
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [draft: EnumDraft | null], 'after:leave': [] }>()

const local = ref<EnumDraft>({ ...props.draft, values: [...props.draft.values] })
watch(() => props.draft, (next) => {
  local.value = { ...next, values: [...next.values] }
}, { deep: true })

const close = (draft: EnumDraft | null) => emit('close', draft)
useModalDismiss(open, close, null)

/** An enum with no values generates nothing, so it is not a valid save. */
const canSubmit = computed(() =>
  local.value.name.trim().length > 0 && local.value.values.some(v => v.trim().length > 0)
)
const normalizedEnumName = computed(() => {
  const raw = local.value.name
  if (!raw.trim()) return undefined
  const next = raw.trim().replace(/\s+/g, '_')
  return next !== raw ? `Saves as ${next}` : undefined
})

function addValue() {
  local.value.values.push('')
}

function removeValue(index: number) {
  local.value.values.splice(index, 1)
}

function submit() {
  if (!canSubmit.value) return
  close({
    name: local.value.name,
    values: local.value.values.map(v => v.trim()).filter(Boolean)
  })
}
</script>

<template>
  <UModal v-model:open="open" :title="title" @after:leave="emit('after:leave')">
    <template #body>
      <form id="enum-form" class="space-y-4" @submit.prevent="submit">
        <UFormField label="Enum name" required :hint="normalizedEnumName">
          <UInput v-model="local.name" placeholder="e.g. OrderStatus" autofocus class="w-full font-mono" />
        </UFormField>

        <UFormField label="Values" required>
          <div class="space-y-1.5">
            <div v-for="(_, index) in local.values" :key="index" class="flex items-center gap-1.5">
              <UInput v-model="local.values[index]" placeholder="value" class="flex-1 font-mono" />
              <UButton
                icon="i-ph-trash"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Remove value ${index + 1}`"
                :disabled="local.values.length <= 1"
                @click="removeValue(index)"
              />
            </div>

            <button
              type="button"
              class="w-full h-8 border-2 border-dashed border-line-dashed text-[11.5px]
                     text-accent-400 hover:bg-white/5 transition-colors
                     focus-visible:outline-2 focus-visible:outline-accent-500"
              @click="addValue()"
            >
              + Add value
            </button>
          </div>
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton :label="submitLabel" type="submit" form="enum-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
