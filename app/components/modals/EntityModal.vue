<script setup lang="ts">
import type { DatabaseEngine } from '#shared/types/schema'
import type { Gradient } from '#shared/types/workspace'
import { GRADIENTS } from '#shared/types/workspace'
import { slugify } from '#shared/utils/ids'

/**
 * Databases, schemas and tables differ by two optional fields — the engine and
 * the parent schema — and are otherwise the same form. Three components would
 * have been three copies of the name input, the swatch row and the comment box.
 */
export interface EntityDraft {
  name: string
  gradient: Gradient
  comment: string
  engine?: DatabaseEngine
  schemaId?: string
}

const props = defineProps<{
  kind: 'database' | 'schema' | 'table'
  title: string
  submitLabel: string
  draft: EntityDraft
  /** Required for tables: the schemas the table may be moved between. */
  schemaOptions?: { label: string, value: string }[]
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

// The overlay keeps this component mounted between opens, so the draft is a
// copy taken per open rather than a one-shot ref initialiser.
const local = ref<EntityDraft>({ ...props.draft, gradient: [...props.draft.gradient] as Gradient })
watch(() => props.draft, (next) => {
  local.value = { ...next, gradient: [...next.gradient] as Gradient }
}, { deep: true })

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
  <UModal v-model:open="open" :title="title" @after:leave="emit('after:leave')">
    <template #body>
      <form id="entity-form" class="space-y-4" @submit.prevent="submit">
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

        <UFormField label="Colour">
          <div class="flex items-center gap-2">
            <button
              v-for="gradient in GRADIENTS"
              :key="gradient[0]"
              type="button"
              class="size-7 border-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent-500"
              :class="isSelected(gradient) ? 'border-ink-bright' : 'border-transparent'"
              :style="{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }"
              :aria-label="`Colour ${gradient[0]}`"
              :aria-pressed="isSelected(gradient)"
              @click="local.gradient = [...gradient] as Gradient"
            />
          </div>
        </UFormField>

        <UFormField label="Comment">
          <UTextarea v-model="local.comment" :rows="2" placeholder="Optional" class="w-full" />
        </UFormField>
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
