<script setup lang="ts">
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()
const actions = useWorkspaceActions()
const colorMode = useColorMode()

const isDesktop = isDesktopApp()
const desktopDoc = isDesktop ? useDesktopDocumentStore() : null
const desktopActions = isDesktop ? useDesktopDocumentActions() : null
const shortcutsOpen = ref(false)

const isDark = computed(() => colorMode.value !== 'light')
function toggleColorMode() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

function onGlobalCommandShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ui.commandPaletteOpen = !ui.commandPaletteOpen
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalCommandShortcut)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalCommandShortcut)
})

const fileItems = computed(() => {
  if (!desktopActions) return []
  return [
    [
      { label: 'New Project', icon: 'i-ph-file-plus', onSelect: () => void desktopActions.newFile() },
      { label: 'Welcome Hub & Templates…', icon: 'i-ph-sparkle', onSelect: () => { ui.welcomeOpen = true } },
      { label: 'Open…', icon: 'i-ph-folder-open', onSelect: () => void desktopActions.openFile() },
      { label: 'Save', icon: 'i-ph-floppy-disk', onSelect: () => void desktopActions.saveFile() },
      { label: 'Save As…', icon: 'i-ph-floppy-disk-back', onSelect: () => void desktopActions.saveFileAs() }
    ]
  ]
})

const importItems = computed(() => [[
  { label: 'Import SQL DDL…', icon: 'i-ph-file-sql', disabled: !ui.activeDbId, onSelect: onImport },
  { label: 'Import Workspace (.schemacrafter / .json)…', icon: 'i-ph-package', onSelect: () => actions.promptWebWorkspaceImport() },
  { label: 'Starter Templates…', icon: 'i-ph-sparkle', onSelect: () => { ui.welcomeOpen = true } }
]])

const exportItems = computed(() => {
  const diagrams = [
    { label: 'PNG Diagram (2x)', icon: 'i-ph-image', onSelect: () => void actions.exportPng() },
    { label: 'SVG Vector Diagram', icon: 'i-ph-vector-three', onSelect: () => actions.exportSvg() },
    { label: 'Mermaid ER (.mmd)', icon: 'i-ph-graph', onSelect: () => actions.exportMermaid() },
    { label: 'Markdown Docs (.md)', icon: 'i-ph-file-text', onSelect: () => actions.exportMarkdown() }
  ]

  const code = [
    { label: 'SQL DDL (.sql)', icon: 'i-ph-file-sql', onSelect: () => actions.exportSql() },
    { label: 'Project JSON (.json)', icon: 'i-ph-brackets-curly', onSelect: () => actions.exportJson() },
    { label: 'Multi-file Bundle (.zip)', icon: 'i-ph-file-archive', onSelect: () => actions.exportMultiFileZip() },
    ...(isDesktop
      ? [{ label: 'Export Bundle to Folder…', icon: 'i-ph-folder-open', onSelect: () => void actions.exportDesktopFolder() }]
      : []),
    { label: 'Workspace (.schemacrafter)', icon: 'i-ph-package', onSelect: () => actions.exportWorkspaceFile() }
  ]

  const migration = [
    { label: 'SQL Migration Diff…', icon: 'i-ph-git-diff', onSelect: () => { ui.migrationDiffOpen = true } }
  ]

  return [diagrams, code, migration]
})

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
           bg-surface-chrome border-b border-line-chrome relative z-50"
  >
    <!-- Left: sidebar toggle, logo, wordmark, document chip -->
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
          class="size-7 shrink-0 rounded-md grid place-items-center shadow-xs"
          :style="{ background: 'linear-gradient(135deg, var(--color-accent-500), var(--color-accent-700))' }"
        >
          <UIcon name="i-ph-database" class="size-4 text-white" />
        </span>
        <span class="font-semibold text-[13.5px] tracking-[0.2px] text-ink-bright truncate">
          SchemaCrafter
        </span>
      </div>

      <span class="hidden md:flex items-center gap-1.5 pl-2 text-ink-dim text-xs min-w-0">
        <template v-if="desktopDoc">
          <span
            class="inline-flex items-center gap-1.5 rounded-md border border-line-panel bg-surface-raised/80 px-2 py-0.5 max-w-52"
            :title="desktopDoc.currentFilePath ?? 'Unsaved workspace'"
          >
            <UIcon name="i-ph-file-code" class="size-3.5 text-ink-dim shrink-0" />
            <span class="truncate font-mono text-[11.5px] text-ink">{{ desktopDoc.fileName }}</span>
            <span
              v-if="desktopDoc.isDirty"
              class="size-1.5 rounded-full bg-sync-pending shrink-0"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          </span>
        </template>
        <span class="text-line-panel">/</span>
        <span class="truncate text-ink-muted font-medium">{{ activeName }}</span>
        <UBadge :label="engine" color="neutral" variant="subtle" size="sm" class="font-mono" />
      </span>
    </div>

    <!-- Right: search trigger, desktop file actions, import, export, theme/help, sidebar toggle -->
    <div class="flex items-center gap-1.5">
      <UTooltip text="Command Palette (Ctrl+K)">
        <button
          type="button"
          class="hidden lg:inline-flex items-center gap-2 rounded-md border border-line-panel bg-surface-raised/65 px-2.5 py-1 text-[11.5px] text-ink-muted hover:text-ink-bright hover:border-accent-500/40 transition-colors"
          @click="ui.commandPaletteOpen = true"
        >
          <UIcon name="i-ph-magnifying-glass" class="size-3.5 text-ink-dim" />
          <span>Search / Actions</span>
          <kbd class="rounded border border-line-chrome bg-surface-chrome px-1 py-0.5 font-mono text-[9.5px] text-ink-faint">Ctrl+K</kbd>
        </button>
      </UTooltip>

      <UButton
        icon="i-ph-magnifying-glass"
        color="neutral"
        variant="ghost"
        size="sm"
        class="lg:hidden"
        aria-label="Command palette"
        @click="ui.commandPaletteOpen = true"
      />

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

      <UDropdownMenu :items="importItems" :content="{ align: 'end' }">
        <UButton
          label="Import"
          icon="i-ph-upload-simple"
          trailing-icon="i-ph-caret-down"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </UDropdownMenu>

      <UDropdownMenu :items="exportItems" :content="{ align: 'end' }">
        <UButton
          label="Export"
          icon="i-ph-download-simple"
          trailing-icon="i-ph-caret-down"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="!ui.activeDbId"
        />
      </UDropdownMenu>

      <span class="hidden sm:block w-px h-5 bg-line-chrome mx-0.5" />

      <UTooltip :text="isDark ? 'Switch to light theme' : 'Switch to dark theme'">
        <UButton
          :icon="isDark ? 'i-ph-sun' : 'i-ph-moon'"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleColorMode()"
        />
      </UTooltip>

      <UTooltip text="Keyboard shortcuts">
        <UButton
          icon="i-ph-question"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Keyboard shortcuts"
          @click="shortcutsOpen = true"
        />
      </UTooltip>

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

    <ShortcutsModal v-model:open="shortcutsOpen" />
    <MigrationDiffModal v-model:open="ui.migrationDiffOpen" />
    <CommandPaletteModal
      v-model:open="ui.commandPaletteOpen"
      @open-migrations="ui.migrationDiffOpen = true"
      @open-welcome="ui.welcomeOpen = true"
      @open-shortcuts="shortcutsOpen = true"
    />
  </header>
</template>
