<script setup lang="ts">
import type { HttpMethod } from '#shared/types/workspace'
import { HTTP_METHODS } from '#shared/types/workspace'
import { normalizeEndpointPath, resolveFullEndpointPath, splitPathSegments } from '#shared/utils/apiDesign'
import { HTTP_METHOD_BADGE } from '~/utils/httpMethod'
import type { ModuleTableOption } from './ModuleModal.vue'

export interface EndpointModuleOption {
  id: string
  name: string
  basePath: string
}

export interface EndpointDraft {
  moduleId: string
  method: HttpMethod
  path: string
  description: string
  tableIds: string[]
}

const props = defineProps<{
  title: string
  submitLabel: string
  draft: EndpointDraft
  modules: EndpointModuleOption[]
  tables: ModuleTableOption[]
  /** Optional hook allowing the user to create a new DB table straight from this route. */
  onQuickCreateTable?: (path: string, moduleId: string) => Promise<ModuleTableOption | null>
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [draft: EndpointDraft | null], 'after:leave': [] }>()

const local = ref<EndpointDraft>({
  ...props.draft,
  tableIds: [...props.draft.tableIds]
})

const availableTables = ref<ModuleTableOption[]>([...props.tables])

watch(() => props.draft, (next) => {
  local.value = { ...next, tableIds: [...next.tableIds] }
}, { deep: true })

watch(() => props.tables, (next) => {
  availableTables.value = [...next]
}, { deep: true })

const selectedModule = computed(() => props.modules.find(m => m.id === local.value.moduleId))
const moduleItems = computed(() =>
  props.modules.map(m => ({ label: m.basePath ? `${m.name} (${m.basePath})` : m.name, value: m.id }))
)

const previewFullPath = computed(() =>
  resolveFullEndpointPath(selectedModule.value?.basePath ?? '', local.value.path)
)
const previewTokens = computed(() => splitPathSegments(previewFullPath.value))
const canSubmit = computed(() => local.value.moduleId.length > 0 && local.value.path.trim().length > 0)

function toggleTable(id: string) {
  const idx = local.value.tableIds.indexOf(id)
  if (idx === -1) local.value.tableIds.push(id)
  else local.value.tableIds.splice(idx, 1)
}

async function handleQuickCreateTable() {
  if (!props.onQuickCreateTable) return
  const created = await props.onQuickCreateTable(previewFullPath.value, local.value.moduleId)
  if (!created) return
  if (!availableTables.value.some(t => t.id === created.id)) {
    availableTables.value.push(created)
  }
  if (!local.value.tableIds.includes(created.id)) {
    local.value.tableIds.push(created.id)
  }
}

const close = (draft: EndpointDraft | null) => emit('close', draft)
useModalDismiss(open, close, null)

function submit() {
  if (!canSubmit.value) return
  close({
    ...local.value,
    path: normalizeEndpointPath(local.value.path),
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
      <form id="endpoint-form" class="space-y-4" @submit.prevent="submit">
        <!-- Live endpoint preview -->
        <div class="flex items-center gap-2.5 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised px-3 py-2.5">
          <span
            class="shrink-0 rounded border px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide"
            :class="HTTP_METHOD_BADGE[local.method]"
          >
            {{ local.method }}
          </span>
          <span class="font-mono text-[12.5px] text-ink-bright truncate">
            <span
              v-for="(tok, idx) in previewTokens"
              :key="idx"
              :class="tok.isParam ? 'text-accent-300 [.light_&]:text-accent-700 font-semibold' : ''"
            >{{ tok.text }}</span>
          </span>
        </div>

        <UFormField label="Module" required>
          <USelect
            v-model="local.moduleId"
            :items="moduleItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="HTTP Method" required>
          <div class="grid grid-cols-5 gap-1.5">
            <button
              v-for="m in HTTP_METHODS"
              :key="m"
              type="button"
              :aria-pressed="local.method === m"
              class="rounded border py-1.5 font-mono text-[11px] font-semibold transition-all"
              :class="local.method === m
                ? `${HTTP_METHOD_BADGE[m]} ring-1 ring-current`
                : 'border-line-panel bg-surface-raised/40 text-ink-dim hover:text-ink'"
              @click="local.method = m"
            >
              {{ m }}
            </button>
          </div>
        </UFormField>

        <UFormField label="Path" required hint="Supports :id or {id} params">
          <UInput
            v-model="local.path"
            placeholder="/users/:id"
            autofocus
            class="w-full font-mono"
          />
        </UFormField>

        <UFormField label="Short description" hint="Visual documentation only">
          <UTextarea
            v-model="local.description"
            placeholder="Briefly describe what this endpoint does…"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Linked tables" :hint="`${local.tableIds.length} selected`">
          <div class="space-y-2 rounded-md border border-line-panel bg-surface-raised/35 p-2.5">
            <div v-if="availableTables.length > 0" class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-thin">
              <button
                v-for="t in availableTables"
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
              No tables in this database yet.
            </p>

            <button
              v-if="onQuickCreateTable"
              type="button"
              class="inline-flex items-center gap-1.5 rounded border border-dashed border-line-dashed px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:text-ink-bright hover:border-accent-500/60 hover:bg-accent-500/5 transition-colors"
              @click="handleQuickCreateTable"
            >
              <UIcon name="i-ph-table" class="size-3.5 text-accent-400 [.light_&]:text-accent-600" />
              <span>Create new table from route…</span>
            </button>
          </div>
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
        <UButton :label="submitLabel" type="submit" form="endpoint-form" :disabled="!canSubmit" />
      </div>
    </template>
  </UModal>
</template>
