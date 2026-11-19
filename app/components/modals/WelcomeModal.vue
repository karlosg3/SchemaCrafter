<script setup lang="ts">
import { PROJECT_TEMPLATES } from '#shared/utils/templates'
import { emptyWorkspace } from '#shared/types/workspace'
import type { RecentFileEntry, RecoveryDraftResult } from '~/desktop/session'
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const props = defineProps<{
  recovery?: RecoveryDraftResult | null
  recentFiles?: RecentFileEntry[]
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  restoreRecovery: []
  discardRecovery: []
  openRecent: [path: string]
  removeRecent: [path: string]
  requestImportWorkspace: []
}>()

const ui = useUiStore()
const workspace = useWorkspaceStore()
const actions = useWorkspaceActions()
const isDesktop = isDesktopApp()
const desktopDoc = isDesktop ? useDesktopDocumentStore() : null
const desktopActions = isDesktop ? useDesktopDocumentActions() : null

function formatSavedTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function startBlank() {
  if (desktopDoc) {
    desktopDoc.loadTemplateWorkspace(emptyWorkspace())
  }
  const db = workspace.createDatabase('Main Database', 'postgresql')
  ui.selectDatabase(db.id)
  ui.setViewLevel('tables')
  open.value = false
}

async function openProject() {
  if (isDesktop && desktopActions) {
    const ok = await desktopActions.openFile()
    if (ok) open.value = false
    return
  }
  open.value = false
  emit('requestImportWorkspace')
}

async function pickTemplate(index: number) {
  const tpl = PROJECT_TEMPLATES[index]
  if (!tpl) return
  const ok = await actions.loadStarterTemplate(tpl.project, tpl.name)
  if (ok) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Welcome to SchemaCrafter"
    description="Open a recent workspace, restore an unsaved session, or start from a template."
    :ui="{ content: 'max-w-2xl border border-line-panel bg-[#0E1E35] [.light_&]:bg-surface-block' }"
  >
    <template #body>
      <div class="space-y-5">
        <!-- Brand drafting banner -->
        <div class="flex items-center gap-3.5 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised/85 px-3.5 py-3">
          <BrandMark size-class="size-10" />
          <div class="min-w-0">
            <p class="text-[14px] font-semibold text-ink-bright tracking-tight">
              SchemaCrafter
            </p>
            <p class="text-[11.5px] text-ink-muted">
              Architectural Database &amp; API Blueprint Studio
            </p>
          </div>
        </div>

        <!-- Crash recovery banner -->
        <div
          v-if="props.recovery"
          class="rounded-md border border-[#D99426]/45 bg-[#D99426]/12 p-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div class="space-y-0.5 min-w-0">
            <p class="text-[12.5px] font-semibold text-[#F2C15A] [.light_&]:text-[#8A5406] flex items-center gap-1.5">
              <UIcon name="i-ph-clock-counter-clockwise" class="size-4 shrink-0" />
              Unsaved session found
            </p>
            <p class="text-[11px] font-mono text-ink-muted truncate">
              Captured {{ formatSavedTime(props.recovery.savedAt) }}
              <template v-if="props.recovery.sourcePath"> · {{ props.recovery.sourcePath }}</template>
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UButton
              label="Discard"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="emit('discardRecovery')"
            />
            <UButton
              label="Restore session"
              size="xs"
              color="warning"
              @click="emit('restoreRecovery'); open = false"
            />
          </div>
        </div>

        <!-- Primary quick actions -->
        <div class="grid sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            class="flex items-center gap-3 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised/80 p-3 text-left
                   hover:border-accent-500/55 hover:bg-surface-raised transition-colors"
            @click="startBlank()"
          >
            <span class="size-9 rounded-md bg-accent-500/15 border border-accent-500/30 grid place-items-center text-accent-400 [.light_&]:text-accent-600 shrink-0">
              <UIcon name="i-ph-file-plus" class="size-4.5" />
            </span>
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-ink-bright">New Blank Database</p>
              <p class="text-[11px] text-ink-muted">Start clean with a fresh PostgreSQL schema</p>
            </div>
          </button>

          <button
            type="button"
            class="flex items-center gap-3 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised/80 p-3 text-left
                   hover:border-accent-500/55 hover:bg-surface-raised transition-colors"
            @click="openProject()"
          >
            <span class="size-9 rounded-md bg-[#265385]/22 border border-[#265385]/40 grid place-items-center text-[#7CC4FA] [.light_&]:bg-[#265385]/10 [.light_&]:border-[#1B5E8A]/28 [.light_&]:text-[#1B5E8A] shrink-0">
              <UIcon name="i-ph-folder-open" class="size-4.5" />
            </span>
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-ink-bright">
                {{ isDesktop ? 'Open Project File…' : 'Import Workspace File…' }}
              </p>
              <p class="text-[11px] text-ink-muted">Load .schemacrafter or legacy .json files</p>
            </div>
          </button>
        </div>

        <!-- Recent Files (Desktop) -->
        <section v-if="isDesktop && props.recentFiles && props.recentFiles.length > 0" class="space-y-2">
          <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
            Recent Projects
          </h3>
          <div class="space-y-1 max-h-36 overflow-y-auto scrollbar-thin pr-0.5">
            <div
              v-for="entry in props.recentFiles"
              :key="entry.path"
              class="group flex items-center gap-2 rounded-md border border-line-row bg-surface-block [.light_&]:bg-surface-raised/65 px-2.5 py-1.5 hover:border-accent-500/40"
            >
              <button
                type="button"
                class="flex-1 min-w-0 flex items-center gap-2 text-left"
                @click="emit('openRecent', entry.path); open = false"
              >
                <BrandMark v-if="entry.name.toLowerCase().endsWith('.schemacrafter')" size-class="size-4" />
                <UIcon v-else name="i-ph-file-code" class="size-4 shrink-0 text-accent-400 [.light_&]:text-accent-600" />
                <span class="font-mono text-[12px] text-ink-bright shrink-0">{{ entry.name }}</span>
                <span class="font-mono text-[10.5px] text-ink-dim truncate">{{ entry.path }}</span>
              </button>
              <UButton
                icon="i-ph-x"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Remove from recents"
                class="opacity-0 group-hover:opacity-100"
                @click="emit('removeRecent', entry.path)"
              />
            </div>
          </div>
        </section>

        <!-- Starter Templates -->
        <section class="space-y-2">
          <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
            Starter Templates
          </h3>
          <div class="grid sm:grid-cols-3 gap-2.5">
            <button
              v-for="(tpl, idx) in PROJECT_TEMPLATES"
              :key="tpl.id"
              type="button"
              class="flex flex-col gap-1.5 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised/75 p-3 text-left
                     hover:border-accent-500/55 hover:bg-surface-raised transition-colors"
              @click="pickTemplate(idx)"
            >
              <div class="flex items-center justify-between gap-2">
                <UIcon :name="tpl.icon" class="size-4 text-accent-400 [.light_&]:text-accent-600" />
                <span class="font-mono text-[9.5px] uppercase text-ink-dim">{{ tpl.engine }}</span>
              </div>
              <p class="text-[12.5px] font-semibold text-ink-bright">{{ tpl.name }}</p>
              <p class="text-[11px] text-ink-muted leading-snug line-clamp-3">{{ tpl.description }}</p>
            </button>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end w-full">
        <UButton label="Continue to canvas" color="neutral" variant="ghost" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
