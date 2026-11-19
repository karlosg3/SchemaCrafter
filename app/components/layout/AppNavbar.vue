<script setup lang="ts">
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import type { WorkspaceMode } from '~/stores/ui'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()
const actions = useWorkspaceActions()
const colorMode = useColorMode()

const WORKSPACE_MODES: { id: WorkspaceMode, label: string, icon: string, shortcut: string }[] = [
  { id: 'database', label: 'Database', icon: 'i-ph-database', shortcut: 'Alt+1' },
  { id: 'modules', label: 'Modules', icon: 'i-ph-cubes', shortcut: 'Alt+2' },
  { id: 'endpoints', label: 'Endpoints', icon: 'i-ph-plugs-connected', shortcut: 'Alt+3' }
]

const modulesCount = computed(() =>
  ui.activeDbId ? workspace.modulesOfDatabase(ui.activeDbId).length : 0
)
const endpointsCount = computed(() =>
  ui.activeDbId ? workspace.endpointsOfDatabase(ui.activeDbId).length : 0
)

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
    return
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (event.key === '1') {
      event.preventDefault()
      ui.setWorkspaceMode('database')
    } else if (event.key === '2') {
      event.preventDefault()
      ui.setWorkspaceMode('modules')
    } else if (event.key === '3') {
      event.preventDefault()
      ui.setWorkspaceMode('endpoints')
    }
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
        <BrandMark size-class="size-7" />
        <span class="font-semibold text-[13.5px] tracking-[0.2px] text-ink-bright truncate">
          SchemaCrafter
        </span>
      </div>

      <span class="hidden md:flex items-center gap-1.5 pl-2 text-ink-dim text-xs min-w-0">
        <template v-if="desktopDoc">
          <span
            class="inline-flex items-center gap-1.5 rounded-md border border-line-panel bg-surface-block/90 px-2 py-0.5 max-w-52"
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

    <!-- Center: Workspace perspective switcher (Database / Modules / Endpoints) -->
    <nav
      aria-label="Workspace view"
      class="inline-flex items-center gap-0.5 rounded-md border border-line-panel bg-surface-root/85 p-0.5 shrink-0"
    >
      <UTooltip
        v-for="mode in WORKSPACE_MODES"
        :key="mode.id"
        :text="`${mode.label} (${mode.shortcut})`"
      >
        <button
          type="button"
          :aria-pressed="ui.state.workspaceMode === mode.id"
          class="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
          :class="ui.state.workspaceMode === mode.id
            ? 'bg-accent-500/20 text-accent-300 border-accent-500/45 [.light_&]:bg-surface-block [.light_&]:text-accent-700 [.light_&]:border-accent-600/35 [.light_&]:shadow-2xs'
            : 'border-transparent text-ink-muted hover:text-ink-bright'"
          @click="ui.setWorkspaceMode(mode.id)"
        >
          <UIcon :name="mode.icon" class="size-3.5 shrink-0" />
          <span class="hidden sm:inline">{{ mode.label }}</span>
          <span
            v-if="mode.id === 'modules' && modulesCount > 0"
            class="hidden md:inline font-mono tabular-nums text-[9.5px] opacity-80"
          >
            {{ modulesCount }}
          </span>
          <span
            v-else-if="mode.id === 'endpoints' && endpointsCount > 0"
            class="hidden md:inline font-mono tabular-nums text-[9.5px] opacity-80"
          >
            {{ endpointsCount }}
          </span>
        </button>
      </UTooltip>
    </nav>

    <!-- Right: search trigger, desktop file actions, import, export, theme/help, sidebar toggle -->
    <div class="flex items-center gap-1.5">
      <UTooltip text="Command Palette (Ctrl+K)">
        <button
          type="button"
          class="hidden lg:inline-flex items-center gap-2 rounded-md border border-line-panel bg-surface-block/70 [.light_&]:bg-surface-block px-2.5 py-1 text-[11.5px] text-ink-muted hover:text-ink-bright hover:border-accent-500/45 transition-colors"
          @click="ui.commandPaletteOpen = true"
        >
          <UIcon name="i-ph-magnifying-glass" class="size-3.5 text-ink-dim" />
          <span>Search / Actions</span>
          <kbd class="rounded border border-line-panel bg-surface-chrome px-1.5 py-0.5 font-mono text-[9.5px] text-ink-dim">Ctrl+K</kbd>
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
        v-if="ui.state.workspaceMode === 'database'"
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
