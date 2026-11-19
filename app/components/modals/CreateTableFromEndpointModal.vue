<script setup lang="ts">
import type { Gradient } from '#shared/types/workspace'
import { DEFAULT_GRADIENT, GRADIENTS } from '#shared/types/workspace'
import type { InferredParentFk } from '#shared/utils/apiDesign'
import { slugify } from '#shared/utils/ids'

export interface CreateTableFromEndpointResult {
  name: string
  schemaId: string
  gradient: Gradient
  comment: string
  includeParentFk: boolean
  openInDatabase: boolean
}

const props = defineProps<{
  sourceLabel: string
  suggestedTableName: string
  parentFk: InferredParentFk | null
  schemaOptions: { label: string, value: string }[]
  defaultSchemaId: string
  defaultGradient?: Gradient
  /** When invoked inline inside EndpointModal, hide "Jump to DB" to stay in modal flow. */
  allowJumpToDb?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [result: CreateTableFromEndpointResult | null], 'after:leave': [] }>()

const name = ref(props.suggestedTableName)
const schemaId = ref(props.defaultSchemaId)
const gradient = ref<Gradient>([...(props.defaultGradient ?? DEFAULT_GRADIENT)] as Gradient)
const comment = ref('')
const includeParentFk = ref(!!props.parentFk)
const openInDatabase = ref(false)

const normalizedName = computed(() => slugify(name.value))
const canSubmit = computed(() => name.value.trim().length > 0 && schemaId.value.length > 0)

function isSelectedGradient(g: Gradient) {
  return gradient.value[0] === g[0] && gradient.value[1] === g[1]
}

const close = (result: CreateTableFromEndpointResult | null) => emit('close', result)
useModalDismiss(open, close, null)

function submit() {
  if (!canSubmit.value) return
  close({
    name: normalizedName.value,
    schemaId: schemaId.value,
    gradient: [...gradient.value] as Gradient,
    comment: comment.value.trim(),
    includeParentFk: includeParentFk.value && !!props.parentFk,
    openInDatabase: openInDatabase.value && !!props.allowJumpToDb
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Create Table from Route"
    :ui="{ content: 'max-w-md border border-line-panel bg-[#0E1E35] [.light_&]:bg-surface-block' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="create-table-from-ep-form" class="space-y-4" @submit.prevent="submit">
        <div class="rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised px-3 py-2 space-y-0.5">
          <p class="text-[10.5px] uppercase tracking-wider text-ink-dim">
            Derived from
          </p>
          <p class="font-mono text-[12px] text-ink-bright truncate">
            {{ sourceLabel }}
          </p>
        </div>

        <UFormField
          label="Table name"
          required
          :hint="name.trim() && normalizedName !== name ? `Saves as ${normalizedName}` : undefined"
        >
          <UInput
            v-model="name"
            placeholder="e.g. sessions"
            autofocus
            class="w-full font-mono"
          />
        </UFormField>

        <UFormField v-if="schemaOptions.length > 0" label="Target schema" required>
          <USelect
            v-model="schemaId"
            :items="schemaOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <!-- Base columns preview & optional inferred parent FK -->
        <div class="rounded-md border border-line-panel bg-surface-raised/40 p-2.5 space-y-2">
          <p class="text-[11px] font-medium text-ink">
            Initial columns
          </p>
          <div class="flex items-center justify-between text-[11.5px] font-mono text-ink-muted">
            <span class="flex items-center gap-1.5">
              <UIcon name="i-ph-key" class="size-3 text-pk" />
              id
            </span>
            <span class="text-[10px] text-ink-dim">UUID · PK</span>
          </div>

          <label
            v-if="parentFk"
            class="flex items-center justify-between gap-2 pt-1.5 border-t border-line-row text-[11.5px] cursor-pointer select-none"
          >
            <span class="flex items-center gap-2 min-w-0">
              <input v-model="includeParentFk" type="checkbox" class="accent-accent-500">
              <span class="font-mono text-ink-bright truncate">{{ parentFk.columnName }}</span>
            </span>
            <span class="shrink-0 font-mono text-[10px] text-accent-300 [.light_&]:text-accent-700">
              FK → {{ parentFk.targetTableName }}.{{ parentFk.targetColumnName }}
            </span>
          </label>
        </div>

        <UFormField label="Accent colour">
          <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
            <button
              v-for="(g, i) in GRADIENTS"
              :key="i"
              type="button"
              :aria-label="`Colour ${i + 1}`"
              :aria-pressed="isSelectedGradient(g)"
              class="h-7 w-full rounded-md grid place-items-center ring-offset-2 ring-offset-[#0E1E35] [.light_&]:ring-offset-surface-block transition-transform hover:scale-105"
              :class="isSelectedGradient(g) ? 'ring-2 ring-ink-bright' : 'opacity-85 hover:opacity-100'"
              :style="{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }"
              @click="gradient = [...g] as Gradient"
            >
              <UIcon v-if="isSelectedGradient(g)" name="i-ph-check-bold" class="size-3.5 text-white drop-shadow" />
            </button>
          </div>
        </UFormField>

        <UFormField label="Comment" hint="Optional">
          <UInput v-model="comment" placeholder="Table description" class="w-full" />
        </UFormField>

        <label
          v-if="allowJumpToDb"
          class="flex items-center gap-2 text-[11.5px] text-ink-muted cursor-pointer select-none"
        >
          <input v-model="openInDatabase" type="checkbox" class="accent-accent-500">
          <span>Open table in Database canvas after creating</span>
        </label>
      </form>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton label="Create & Link Table" type="submit" form="create-table-from-ep-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
