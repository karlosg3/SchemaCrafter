<script setup lang="ts">
import { generateCodeForTarget } from '#shared/generators/index'
import { slugify } from '#shared/utils/ids'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()
const toast = useToast()

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
          SchemaCraft
        </span>
      </div>

      <span class="hidden md:flex items-center gap-1.5 pl-2 text-ink-dim text-xs min-w-0">
        <span class="text-line-panel">/</span>
        <span class="truncate">{{ activeName }}</span>
        <UBadge :label="engine" color="neutral" variant="subtle" size="sm" class="font-mono" />
      </span>
    </div>

    <!-- Right: import, download, sidebar toggle -->
    <div class="flex items-center gap-2">
      <UButton
        label="Import SQL"
        icon="i-ph-upload-simple"
        color="neutral"
        variant="outline"
        size="sm"
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
