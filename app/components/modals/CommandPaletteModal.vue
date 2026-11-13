<script setup lang="ts">
import type { ORMTarget } from '#shared/types/schema'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

interface CommandEntry {
  id: string
  category: string
  label: string
  hint?: string
  icon: string
  keywords?: string
  run: () => void | Promise<void>
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  openMigrations: []
  openWelcome: []
  openShortcuts: []
}>()

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()
const actions = useWorkspaceActions()
const colorMode = useColorMode()
const isDesktop = isDesktopApp()
const desktopActions = isDesktop ? useDesktopDocumentActions() : null

const query = ref('')
const activeIndex = ref(0)

watch(open, (val) => {
  if (!val) return
  query.value = ''
  activeIndex.value = 0
})

const allCommands = computed<CommandEntry[]>(() => {
  const cmds: CommandEntry[] = []

  if (ui.activeSchemaId && ui.state.editable) {
    const sId = ui.activeSchemaId
    cmds.push(
      { id: 'act-new-table', category: 'Actions', label: 'New table', hint: 'Active schema', icon: 'i-ph-table', run: () => dialogs.createTable(sId) },
      { id: 'act-new-enum', category: 'Actions', label: 'New enum', hint: 'Active schema', icon: 'i-ph-list-bullets', run: () => dialogs.createEnum(sId) },
      { id: 'act-layout', category: 'Actions', label: 'Auto-arrange layout (DAG)', hint: 'Topological FK flow', icon: 'i-ph-flow-arrow', run: () => workspace.autoLayout(sId) }
    )
  }

  if (ui.activeDbId && ui.state.editable) {
    const dbId = ui.activeDbId
    cmds.push(
      { id: 'act-new-schema', category: 'Actions', label: 'New schema', hint: 'Active database', icon: 'i-ph-folders', run: () => dialogs.createSchema(dbId) },
      { id: 'act-import-sql', category: 'Actions', label: 'Import SQL DDL…', icon: 'i-ph-upload-simple', run: () => dialogs.importSql(dbId) }
    )
  }

  if (ui.state.editable) {
    cmds.push({ id: 'act-new-db', category: 'Actions', label: 'New database', icon: 'i-ph-database', run: () => dialogs.createDatabase() })
  }

  if (workspace.canUndo) {
    cmds.push({ id: 'act-undo', category: 'History', label: 'Undo last change', hint: 'Ctrl+Z', icon: 'i-ph-arrow-u-up-left', run: () => { workspace.undo() } })
  }
  if (workspace.canRedo) {
    cmds.push({ id: 'act-redo', category: 'History', label: 'Redo change', hint: 'Ctrl+Shift+Z', icon: 'i-ph-arrow-u-up-right', run: () => { workspace.redo() } })
  }

  cmds.push(
    { id: 'tool-diff', category: 'Tools & Export', label: 'SQL Migration Diff…', hint: 'ALTER TABLE generator', icon: 'i-ph-git-diff', run: () => emit('openMigrations') },
    { id: 'tool-welcome', category: 'Tools & Export', label: 'Welcome Hub & Starter Templates…', icon: 'i-ph-sparkle', run: () => emit('openWelcome') },
    { id: 'exp-png', category: 'Tools & Export', label: 'Export 2x PNG diagram', icon: 'i-ph-image', run: () => actions.exportPng() },
    { id: 'exp-svg', category: 'Tools & Export', label: 'Export SVG vector diagram', icon: 'i-ph-vector-three', run: () => actions.exportSvg() },
    { id: 'exp-mmd', category: 'Tools & Export', label: 'Export Mermaid ER (.mmd)', icon: 'i-ph-graph', run: () => actions.exportMermaid() },
    { id: 'exp-md', category: 'Tools & Export', label: 'Export Markdown documentation (.md)', icon: 'i-ph-file-text', run: () => actions.exportMarkdown() },
    { id: 'exp-zip', category: 'Tools & Export', label: 'Export multi-file ZIP bundle', icon: 'i-ph-file-archive', run: () => actions.exportMultiFileZip() },
    { id: 'exp-ws', category: 'Tools & Export', label: 'Download .schemacrafter workspace file', icon: 'i-ph-package', run: () => actions.exportWorkspaceFile() }
  )

  if (isDesktop && desktopActions) {
    cmds.push(
      { id: 'exp-folder', category: 'Tools & Export', label: 'Export all files to folder…', icon: 'i-ph-folder-open', run: () => actions.exportDesktopFolder() },
      { id: 'desk-open', category: 'Desktop File', label: 'Open project file…', hint: 'Ctrl+O', icon: 'i-ph-folder-open', run: () => { void desktopActions.openFile() } },
      { id: 'desk-save', category: 'Desktop File', label: 'Save project file', hint: 'Ctrl+S', icon: 'i-ph-floppy-disk', run: () => { void desktopActions.saveFile() } }
    )
  }

  const targets: { id: ORMTarget, label: string }[] = [
    { id: 'sql', label: 'SQL DDL' },
    { id: 'prisma', label: 'Prisma Schema' },
    { id: 'drizzle', label: 'Drizzle ORM' },
    { id: 'typeorm', label: 'TypeORM' },
    { id: 'mikroorm', label: 'MikroORM' }
  ]
  for (const t of targets) {
    cmds.push({
      id: `gen-${t.id}`,
      category: 'Code Generator',
      label: `Switch generator to ${t.label}`,
      icon: 'i-ph-code',
      run: () => {
        ui.setCodeTarget(t.id)
        if (!ui.state.rightOpen) ui.toggleRight()
      }
    })
  }

  cmds.push(
    {
      id: 'pref-theme',
      category: 'Preferences',
      label: colorMode.value === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
      icon: colorMode.value === 'light' ? 'i-ph-moon' : 'i-ph-sun',
      run: () => { colorMode.preference = colorMode.value === 'light' ? 'dark' : 'light' }
    },
    {
      id: 'pref-grid',
      category: 'Preferences',
      label: ui.state.snapToGrid ? 'Disable snap to grid' : 'Enable snap to grid (16px)',
      icon: 'i-ph-grid-four',
      run: () => ui.toggleDisplay('snapToGrid')
    },
    {
      id: 'pref-minimap',
      category: 'Preferences',
      label: ui.state.showMinimap ? 'Hide minimap' : 'Show minimap',
      icon: 'i-ph-map-trifold',
      run: () => ui.toggleDisplay('showMinimap')
    },
    {
      id: 'pref-shortcuts',
      category: 'Preferences',
      label: 'Keyboard shortcuts',
      icon: 'i-ph-keyboard',
      run: () => emit('openShortcuts')
    }
  )

  for (const db of workspace.databases) {
    cmds.push({
      id: `nav-db-${db.id}`,
      category: 'Navigate Entities',
      label: db.name,
      hint: `Database · ${db.engine}`,
      icon: 'i-ph-database',
      run: () => {
        ui.selectDatabase(db.id)
        ui.setViewLevel('schemas')
        ui.requestFocus(db.id)
      }
    })
    for (const sch of workspace.schemasOfDatabase(db.id)) {
      cmds.push({
        id: `nav-sch-${sch.id}`,
        category: 'Navigate Entities',
        label: `${db.name} / ${sch.name}`,
        hint: 'Schema',
        icon: 'i-ph-folders',
        run: () => {
          ui.selectDatabase(db.id)
          ui.selectSchema(sch.id)
          ui.setViewLevel('tables')
        }
      })
      for (const tbl of workspace.tablesOfSchema(sch.id)) {
        cmds.push({
          id: `nav-tbl-${tbl.id}`,
          category: 'Navigate Entities',
          label: tbl.name,
          hint: `Table · ${sch.name}`,
          keywords: `${db.name} ${sch.name} ${tbl.columns.map(c => c.name).join(' ')}`,
          icon: 'i-ph-table',
          run: () => {
            ui.selectDatabase(db.id)
            ui.selectSchema(sch.id)
            ui.setViewLevel('tables')
            ui.requestFocus(tbl.id)
          }
        })
      }
      for (const en of workspace.enumsOfSchema(sch.id)) {
        cmds.push({
          id: `nav-enum-${en.id}`,
          category: 'Navigate Entities',
          label: en.name,
          hint: `Enum · ${sch.name}`,
          icon: 'i-ph-list-bullets',
          run: () => {
            ui.selectDatabase(db.id)
            ui.selectSchema(sch.id)
            ui.setViewLevel('tables')
            ui.requestFocus(en.id)
          }
        })
      }
    }
  }

  return cmds
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allCommands.value.slice(0, 30)
  return allCommands.value
    .filter(item =>
      item.label.toLowerCase().includes(q)
      || item.category.toLowerCase().includes(q)
      || (item.hint?.toLowerCase().includes(q) ?? false)
      || (item.keywords?.toLowerCase().includes(q) ?? false)
    )
    .slice(0, 30)
})

watch(filtered, () => {
  activeIndex.value = 0
})

function execute(item?: CommandEntry) {
  if (!item) return
  open.value = false
  void item.run()
}

function onKeyDown(event: KeyboardEvent) {
  if (filtered.value.length === 0) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % filtered.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + filtered.value.length) % filtered.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    execute(filtered.value[activeIndex.value])
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'max-w-lg border border-line-chrome bg-surface-chrome overflow-hidden' }"
  >
    <template #content>
      <div class="flex flex-col" @keydown="onKeyDown">
        <div class="flex items-center gap-2.5 border-b border-line-chrome px-3.5 py-2.5">
          <UIcon name="i-ph-magnifying-glass" class="size-4 text-ink-dim shrink-0" />
          <input
            v-model="query"
            type="text"
            autofocus
            placeholder="Jump to table, run action, export, switch generator…"
            class="w-full bg-transparent text-[13px] text-ink-bright placeholder:text-ink-faint focus:outline-none"
          >
          <kbd class="rounded border border-line-panel bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">ESC</kbd>
        </div>

        <div class="max-h-80 overflow-y-auto scrollbar-thin p-1.5 space-y-0.5">
          <p v-if="filtered.length === 0" class="py-8 text-center text-[12px] text-ink-faint">
            No matching commands or schema entities.
          </p>

          <button
            v-for="(item, idx) in filtered"
            :key="item.id"
            type="button"
            class="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors"
            :class="idx === activeIndex
              ? 'bg-accent-500/15 text-ink-bright'
              : 'text-ink hover:bg-white/5'"
            @mouseenter="activeIndex = idx"
            @click="execute(item)"
          >
            <UIcon
              :name="item.icon"
              class="size-4 shrink-0"
              :class="idx === activeIndex ? 'text-accent-400' : 'text-ink-dim'"
            />
            <span class="flex-1 min-w-0 truncate text-[12.5px] font-medium">{{ item.label }}</span>
            <span class="text-[10.5px] font-mono text-ink-faint shrink-0">
              {{ item.hint ?? item.category }}
            </span>
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
