<script setup lang="ts">
import { generateCodeForTarget } from '#shared/generators/index'
import { slugify } from '#shared/utils/ids'
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()
const toast = useToast()

const isDesktop = isDesktopApp()
const desktopDoc = isDesktop ? useDesktopDocumentStore() : null
const desktopActions = isDesktop ? useDesktopDocumentActions() : null

const fileItems = computed(() => {
  if (!desktopActions) return []
  return [[
    { label: 'New Project', icon: 'i-ph-file-plus', onSelect: () => void desktopActions.newFile() },
    { label: 'Open…', icon: 'i-ph-folder-open', onSelect: () => void desktopActions.openFile() },
    { label: 'Save', icon: 'i-ph-floppy-disk', onSelect: () => void desktopActions.saveFile() },
    { label: 'Save As…', icon: 'i-ph-floppy-disk-back', onSelect: () => void desktopActions.saveFileAs() }
  ]]
})

const downloadItems = [[
  { label: 'Download SQL', icon: 'i-ph-file-sql', onSelect: () => download('sql') },
  { label: 'Download JSON', icon: 'i-ph-brackets-curly', onSelect: () => download('json') }
]]

function download(format: 'sql' | 'json') {
  const dbId = ui.activeDbId
  if (!dbId) return

  const project = workspace.projectFor(dbId)
  if (format === 'json') {
    downloadText(`${slugify(project.name)}.json`, JSON.stringify(project, null, 2), 'application/json')
  } else {
    downloadText(codeFileName(project.name, 'sql'), generateCodeForTarget(project, 'sql'), 'application/sql')
  }
  toast.add({ title: `Exported ${format.toUpperCase()}`, color: 'success' })
}

function onImport() {
  if (ui.activeDbId) dialogs.importSql(ui.activeDbId)
}

const activeName = computed(() => ui.activeDatabase?.name ?? 'No database')
const engine = computed(() => workspace.database(ui.activeDbId ?? '')?.engine ?? 'postgresql')
</script>

<template>
  <header
    data-navbar
    class="h-13 shrink-0 flex items-center justify-between px-3 gap-3
           bg-surface-chrome border-b-2 border-line-chrome relative z-50"
  >
    <!-- Left: sidebar toggle, logo, wordmark -->
    <div class="flex items-center gap-2 min-w-0">
      <UButton
        :icon="ui.state.leftOpen ? 'i-ph-sidebar-simple-fill' : 'i-ph-sidebar-simple'"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="ui.state.leftOpen ? 'Collapse left sidebar' : 'Expand left sidebar'"
        :aria-pressed="ui.state.leftOpen"
        @click="ui.toggleLeft()"
      />

      <div class="flex items-center gap-2 min-w-0 pl-1">
        <span
          class="size-6.5 shrink-0 grid place-items-center"
          :style="{ background: 'linear-gradient(135deg, var(--color-accent-500), #1c2029)' }"
        >
          <UIcon name="i-ph-database" class="size-4 text-white" />
        </span>
        <span class="font-semibold text-[13.5px] tracking-[0.2px] text-ink-bright truncate">
          SchemaCrafter
        </span>
      </div>

      <span class="hidden md:flex items-center gap-1.5 pl-2 text-ink-dim text-xs min-w-0">
        <template v-if="desktopDoc">
          <span class="text-line-panel">/</span>
          <span class="truncate font-mono text-ink" :title="desktopDoc.currentFilePath ?? 'Unsaved workspace'">
            {{ desktopDoc.fileName }}
          </span>
          <span
            v-if="desktopDoc.isDirty"
            class="size-1.5 rounded-full bg-sync-pending shrink-0"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          />
        </template>
        <span class="text-line-panel">/</span>
        <span class="truncate">{{ activeName }}</span>
        <UBadge :label="engine" color="neutral" variant="subtle" size="sm" class="font-mono" />
      </span>
    </div>

    <!-- Right: desktop file actions, import, download, sidebar toggle -->
    <div class="flex items-center gap-2">
      <template v-if="desktopDoc && desktopActions">
        <UDropdownMenu :items="fileItems" :content="{ align: 'end' }">
          <UButton
            label="File"
            icon="i-ph-folder-open"
            trailing-icon="i-ph-caret-down"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="desktopDoc.isBusy"
          />
        </UDropdownMenu>

        <UButton
          label="Save"
          icon="i-ph-floppy-disk"
          :color="desktopDoc.isDirty ? 'primary' : 'neutral'"
          :variant="desktopDoc.isDirty ? 'soft' : 'outline'"
          size="sm"
          :loading="desktopDoc.isBusy"
          @click="void desktopActions.saveFile()"
        />
      </template>

      <UButton
        label="Import SQL"
        icon="i-ph-upload-simple"
        color="neutral"
        variant="outline"
        size="sm"
        :disabled="!ui.activeDbId"
        @click="onImport()"
      />

      <UDropdownMenu :items="downloadItems" :content="{ align: 'end' }">
        <UButton
          label="Download"
          icon="i-ph-download-simple"
          trailing-icon="i-ph-caret-down"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="!ui.activeDbId"
        />
      </UDropdownMenu>

      <UButton
        :icon="ui.state.rightOpen ? 'i-ph-sidebar-simple-fill' : 'i-ph-sidebar-simple'"
        color="neutral"
        variant="ghost"
        size="sm"
        class="rotate-180"
        :aria-label="ui.state.rightOpen ? 'Collapse code panel' : 'Expand code panel'"
        :aria-pressed="ui.state.rightOpen"
        @click="ui.toggleRight()"
      />
    </div>
  </header>
</template>
