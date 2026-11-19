<script setup lang="ts">
import type { Gradient, HttpMethod } from '#shared/types/workspace'
import { HTTP_METHODS } from '#shared/types/workspace'
import {
  buildCrudEndpointPresets,
  humanizeResourceName,
  normalizeBasePath,
  normalizeEndpointPath,
  tableToRouteSlug
} from '#shared/utils/apiDesign'
import { HTTP_METHOD_BADGE } from '~/utils/httpMethod'
import type { EndpointModuleOption } from './EndpointModal.vue'

export interface GenerateEndpointsResult {
  moduleId?: string
  newModule?: {
    name: string
    basePath: string
    description: string
    gradient: Gradient
  }
  endpoints: {
    method: HttpMethod
    path: string
    description: string
  }[]
  openEndpointsView: boolean
}

const props = defineProps<{
  tableName: string
  schemaName: string
  tableGradient: Gradient
  modules: EndpointModuleOption[]
  defaultModuleId?: string
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [result: GenerateEndpointsResult | null], 'after:leave': [] }>()

const targetMode = ref<'existing' | 'new'>(props.modules.length > 0 && props.defaultModuleId ? 'existing' : 'new')
const selectedModuleId = ref<string>(props.defaultModuleId ?? props.modules[0]?.id ?? '')
const newModuleName = ref(humanizeResourceName(props.tableName))
const newModuleBasePath = ref(tableToRouteSlug(props.tableName))
const newModuleDescription = ref(`Endpoints for ${props.tableName}`)

const creationMode = ref<'crud' | 'single'>('crud')
const openAfterCreate = ref(true)

const activeBasePath = computed(() => {
  if (targetMode.value === 'existing') {
    return props.modules.find(m => m.id === selectedModuleId.value)?.basePath ?? ''
  }
  return newModuleBasePath.value
})

interface EditablePreset {
  selected: boolean
  method: HttpMethod
  path: string
  description: string
}

const presets = ref<EditablePreset[]>(
  buildCrudEndpointPresets(props.tableName, newModuleBasePath.value).map(p => ({
    selected: p.selectedByDefault,
    method: p.method,
    path: p.path,
    description: p.description
  }))
)

watch(activeBasePath, (nextBase) => {
  const rebuilt = buildCrudEndpointPresets(props.tableName, nextBase)
  presets.value = rebuilt.map((p, idx) => ({
    selected: presets.value[idx]?.selected ?? p.selectedByDefault,
    method: p.method,
    path: p.path,
    description: p.description
  }))
  singlePath.value = normalizeBasePath(nextBase) || tableToRouteSlug(props.tableName)
})

const singleMethod = ref<HttpMethod>('GET')
const singlePath = ref(tableToRouteSlug(props.tableName))
const singleDescription = ref(`Fetch ${props.tableName}`)

const moduleItems = computed(() =>
  props.modules.map(m => ({ label: m.basePath ? `${m.name} (${m.basePath})` : m.name, value: m.id }))
)

const selectedCount = computed(() =>
  creationMode.value === 'crud'
    ? presets.value.filter(p => p.selected && p.path.trim().length > 0).length
    : (singlePath.value.trim().length > 0 ? 1 : 0)
)

const canSubmit = computed(() => {
  if (selectedCount.value === 0) return false
  if (targetMode.value === 'existing') return selectedModuleId.value.length > 0
  return newModuleName.value.trim().length > 0
})

const close = (result: GenerateEndpointsResult | null) => emit('close', result)
useModalDismiss(open, close, null)

function submit() {
  if (!canSubmit.value) return
  const endpoints = creationMode.value === 'crud'
    ? presets.value
        .filter(p => p.selected && p.path.trim().length > 0)
        .map(p => ({
          method: p.method,
          path: normalizeEndpointPath(p.path),
          description: p.description.trim()
        }))
    : [{
        method: singleMethod.value,
        path: normalizeEndpointPath(singlePath.value),
        description: singleDescription.value.trim()
      }]

  close({
    ...(targetMode.value === 'existing'
      ? { moduleId: selectedModuleId.value }
      : {
          newModule: {
            name: newModuleName.value.trim(),
            basePath: normalizeBasePath(newModuleBasePath.value),
            description: newModuleDescription.value.trim(),
            gradient: [...props.tableGradient] as Gradient
          }
        }),
    endpoints,
    openEndpointsView: openAfterCreate.value
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Generate Endpoints from Table"
    :ui="{ content: 'max-w-xl border border-line-chrome bg-surface-chrome' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <form id="generate-endpoints-form" class="space-y-4" @submit.prevent="submit">
        <!-- Source table summary -->
        <div class="flex items-center gap-2.5 rounded-lg border border-line-panel bg-surface-raised/60 px-3 py-2">
          <span
            class="size-7 shrink-0 rounded-md grid place-items-center"
            :style="{ background: `linear-gradient(135deg, ${tableGradient[0]}, ${tableGradient[1]})` }"
          >
            <UIcon name="i-ph-table" class="size-3.5 text-white" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-mono text-[12.5px] font-semibold text-ink-bright truncate">
              {{ schemaName }}.{{ tableName }}
            </p>
            <p class="text-[11px] text-ink-dim">
              Generated endpoints will link automatically to this table.
            </p>
          </div>
        </div>

        <!-- Target module choice -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[11.5px] font-medium text-ink">Target module</span>
            <div v-if="modules.length > 0" class="inline-flex rounded-md border border-line-panel bg-surface-raised p-0.5 text-[11px]">
              <button
                type="button"
                class="rounded px-2 py-0.5 transition-colors"
                :class="targetMode === 'new' ? 'bg-accent-500/20 text-accent-300 [.light_&]:text-accent-700 font-medium' : 'text-ink-dim hover:text-ink'"
                @click="targetMode = 'new'"
              >
                New module
              </button>
              <button
                type="button"
                class="rounded px-2 py-0.5 transition-colors"
                :class="targetMode === 'existing' ? 'bg-accent-500/20 text-accent-300 [.light_&]:text-accent-700 font-medium' : 'text-ink-dim hover:text-ink'"
                @click="targetMode = 'existing'"
              >
                Existing ({{ modules.length }})
              </button>
            </div>
          </div>

          <template v-if="targetMode === 'existing' && modules.length > 0">
            <USelect
              v-model="selectedModuleId"
              :items="moduleItems"
              value-key="value"
              class="w-full"
            />
          </template>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <UFormField label="Module name" required>
              <UInput v-model="newModuleName" placeholder="Users" class="w-full" />
            </UFormField>
            <UFormField label="Base path">
              <UInput v-model="newModuleBasePath" placeholder="/users" class="w-full font-mono" />
            </UFormField>
          </div>
        </div>

        <!-- Preset vs Single switcher -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[11.5px] font-medium text-ink">Endpoints to create</span>
            <div class="inline-flex rounded-md border border-line-panel bg-surface-raised p-0.5 text-[11px]">
              <button
                type="button"
                class="rounded px-2 py-0.5 transition-colors"
                :class="creationMode === 'crud' ? 'bg-accent-500/20 text-accent-300 [.light_&]:text-accent-700 font-medium' : 'text-ink-dim hover:text-ink'"
                @click="creationMode = 'crud'"
              >
                REST CRUD Preset
              </button>
              <button
                type="button"
                class="rounded px-2 py-0.5 transition-colors"
                :class="creationMode === 'single' ? 'bg-accent-500/20 text-accent-300 [.light_&]:text-accent-700 font-medium' : 'text-ink-dim hover:text-ink'"
                @click="creationMode = 'single'"
              >
                Single endpoint
              </button>
            </div>
          </div>

          <div v-if="creationMode === 'crud'" class="space-y-1.5">
            <div
              v-for="(item, idx) in presets"
              :key="idx"
              class="flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors"
              :class="item.selected
                ? 'border-line-panel bg-surface-raised/60'
                : 'border-line-row bg-surface-raised/20 opacity-55'"
            >
              <input
                v-model="item.selected"
                type="checkbox"
                class="accent-accent-500 cursor-pointer"
              >
              <span
                class="w-15 text-center shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                :class="HTTP_METHOD_BADGE[item.method]"
              >
                {{ item.method }}
              </span>
              <input
                v-model="item.path"
                type="text"
                class="w-40 shrink-0 bg-transparent font-mono text-[11.5px] text-ink-bright outline-none border-b border-transparent focus:border-accent-500"
              >
              <input
                v-model="item.description"
                type="text"
                placeholder="Description"
                class="flex-1 min-w-0 bg-transparent text-[11.5px] text-ink-muted outline-none border-b border-transparent focus:border-accent-500"
              >
            </div>
          </div>

          <div v-else class="space-y-3 rounded-md border border-line-panel bg-surface-raised/40 p-3">
            <div class="grid grid-cols-5 gap-1.5">
              <button
                v-for="m in HTTP_METHODS"
                :key="m"
                type="button"
                class="rounded border py-1 font-mono text-[11px] font-semibold"
                :class="singleMethod === m
                  ? `${HTTP_METHOD_BADGE[m]} ring-1 ring-current`
                  : 'border-line-panel bg-surface-chrome text-ink-dim hover:text-ink'"
                @click="singleMethod = m"
              >
                {{ m }}
              </button>
            </div>
            <UFormField label="Path" required>
              <UInput v-model="singlePath" class="w-full font-mono" placeholder="/users" />
            </UFormField>
            <UFormField label="Description">
              <UInput v-model="singleDescription" class="w-full" placeholder="What this endpoint does" />
            </UFormField>
          </div>
        </div>

        <label class="flex items-center gap-2 text-[11.5px] text-ink-muted cursor-pointer select-none">
          <input v-model="openAfterCreate" type="checkbox" class="accent-accent-500">
          <span>Switch to Endpoints view after generating</span>
        </label>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-2 w-full">
        <span class="text-[11px] font-mono text-ink-dim">
          {{ selectedCount }} {{ selectedCount === 1 ? 'endpoint' : 'endpoints' }}
        </span>
        <div class="flex gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="close(null)" />
          <UButton
            :label="`Create ${selectedCount} ${selectedCount === 1 ? 'endpoint' : 'endpoints'}`"
            type="submit"
            form="generate-endpoints-form"
            :disabled="!canSubmit"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
