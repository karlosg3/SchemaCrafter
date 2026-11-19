<script setup lang="ts">
import type { Gradient } from '#shared/types/workspace'
import { GRADIENTS } from '#shared/types/workspace'
import { normalizeBasePath } from '#shared/utils/apiDesign'

export interface ModuleTableOption {
  id: string
  name: string
  schemaName: string
}

export interface ModuleDraft {
  name: string
  basePath: string
  description: string
  gradient: Gradient
  tableIds: string[]
}

const props = defineProps<{
  title: string
  submitLabel: string
  draft: ModuleDraft
  tables: ModuleTableOption[]
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [draft: ModuleDraft | null], 'after:leave': [] }>()

const local = ref<ModuleDraft>({
  ...props.draft,
  gradient: [...props.draft.gradient] as Gradient,
  tableIds: [...props.draft.tableIds]
})

watch(() => props.draft, (next) => {
  local.value = {
    ...next,
    gradient: [...next.gradient] as Gradient,
    tableIds: [...next.tableIds]
  }
}, { deep: true })

const tableSearch = ref('')

const filteredTables = computed(() => {
  const q = tableSearch.value.trim().toLowerCase()
  if (!q) return props.tables
  return props.tables.filter(t =>
    t.name.toLowerCase().includes(q) || t.schemaName.toLowerCase().includes(q)
  )
})

const previewBasePath = computed(() => normalizeBasePath(local.value.basePath) || '/')
const canSubmit = computed(() => local.value.name.trim().length > 0)

function isSelectedGradient(g: Gradient) {
  return local.value.gradient[0] === g[0] && local.value.gradient[1] === g[1]
}

function toggleTable(id: string) {
  const idx = local.value.tableIds.indexOf(id)
  if (idx === -1) local.value.tableIds.push(id)
  else local.value.tableIds.splice(idx, 1)
}

const close = (draft: ModuleDraft | null) => emit('close', draft)
useModalDismiss(open, close, null)

function submit() {
  if (!canSubmit.value) return
  close({
    ...local.value,
    name: local.value.name.trim(),
    basePath: normalizeBasePath(local.value.basePath),
    description: local.value.description.trim(),
    tableIds: [...local.value.tableIds]
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :ui="{ content: 'max-w-lg border border-line-panel bg-[#0E1E35] [.light_&]:bg-surface-block' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="module-form" class="space-y-4" @submit.prevent="submit">
        <!-- Live preview -->
        <div class="flex items-center gap-3 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised px-3 py-2.5">
          <span
            class="size-8 shrink-0 rounded-md grid place-items-center shadow-sm"
            :style="{ background: `linear-gradient(135deg, ${local.gradient[0]}, ${local.gradient[1]})` }"
          >
            <UIcon name="i-ph-cubes" class="size-4 text-white" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-ink-bright truncate">
              {{ local.name.trim() || 'Untitled module' }}
            </p>
            <p class="text-[11px] font-mono text-ink-dim truncate">
              {{ previewBasePath }} · {{ local.tableIds.length }} {{ local.tableIds.length === 1 ? 'entity' : 'entities' }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UFormField label="Module name" required>
            <UInput
              v-model="local.name"
              placeholder="e.g. Users, Billing"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UFormField label="Base path" hint="Optional">
            <UInput
              v-model="local.basePath"
              placeholder="/users"
              class="w-full font-mono"
            />
          </UFormField>
        </div>

        <UFormField label="Description" hint="Optional">
          <UInput
            v-model="local.description"
            placeholder="Brief summary of this API module's responsibility"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Accent colour">
          <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
            <button
              v-for="(g, i) in GRADIENTS"
              :key="i"
              type="button"
              :aria-label="`Colour ${i + 1}`"
              :aria-pressed="isSelectedGradient(g)"
              class="h-7 w-full rounded-md grid place-items-center ring-offset-2 ring-offset-[#0E1E35] [.light_&]:ring-offset-surface-block transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent-500"
              :class="isSelectedGradient(g) ? 'ring-2 ring-ink-bright' : 'opacity-85 hover:opacity-100'"
              :style="{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }"
              @click="local.gradient = [...g] as Gradient"
            >
              <UIcon v-if="isSelectedGradient(g)" name="i-ph-check-bold" class="size-3.5 text-white drop-shadow" />
            </button>
          </div>
        </UFormField>

        <UFormField label="Connected entities (tables)" :hint="`${local.tableIds.length} selected`">
          <div class="space-y-2 rounded-md border border-line-panel bg-surface-raised/35 p-2.5">
            <UInput
              v-if="tables.length > 6"
              v-model="tableSearch"
              icon="i-ph-magnifying-glass"
              placeholder="Filter tables…"
              size="xs"
              class="w-full"
            />
            <div v-if="filteredTables.length > 0" class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto scrollbar-thin">
              <button
                v-for="t in filteredTables"
                :key="t.id"
                type="button"
                class="inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] transition-colors"
                :class="local.tableIds.includes(t.id)
                  ? 'border-accent-500/60 bg-accent-500/15 text-accent-300 [.light_&]:text-accent-700'
                  : 'border-line-panel bg-surface-chrome text-ink-dim hover:text-ink'"
                @click="toggleTable(t.id)"
              >
                <UIcon
                  :name="local.tableIds.includes(t.id) ? 'i-ph-check-square-fill' : 'i-ph-square'"
                  class="size-3.5 shrink-0"
                />
                <span>{{ t.name }}</span>
                <span class="text-[9.5px] opacity-65">{{ t.schemaName }}</span>
              </button>
            </div>
            <p v-else class="text-[11px] text-ink-dim">
              No tables available in this database yet.
            </p>
          </div>
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton :label="submitLabel" type="submit" form="module-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
