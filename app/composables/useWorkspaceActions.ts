import type { DatabaseProject } from '#shared/types/schema'
import { generateCodeForTarget } from '#shared/generators/index'
import {
  projectToMarkdown,
  projectToMermaid,
  projectToMultiFileBundle,
  projectToSvg
} from '#shared/utils/exporters'
import { slugify } from '#shared/utils/ids'
import { migrateV1ToWorkspace } from '#shared/utils/migrations'
import { PROJECT_FILE_EXTENSION, parseProjectFile, serializeProjectFile } from '#shared/utils/projectFile'
import { createZipBytes } from '#shared/utils/zip'
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

/**
 * Shared export, workspace import, and template initialization actions
 * used across the navbar, command palette, and Welcome Hub.
 */
export function useWorkspaceActions() {
  const ui = useUiStore()
  const workspace = useWorkspaceStore()
  const toast = useToast()
  const confirm = useConfirm()
  const colorMode = useColorMode()
  const isDesktop = isDesktopApp()
  const desktopDoc = isDesktop ? useDesktopDocumentStore() : null

  function activeProjectOrToast(): DatabaseProject | null {
    if (!ui.activeDbId) {
      toast.add({ title: 'No active database', color: 'warning' })
      return null
    }
    return workspace.projectFor(ui.activeDbId)
  }

  function exportSql() {
    const project = activeProjectOrToast()
    if (!project) return
    downloadText(codeFileName(project.name, 'sql'), generateCodeForTarget(project, 'sql'), 'application/sql')
    toast.add({ title: 'Exported SQL DDL', color: 'success' })
  }

  function exportJson() {
    const project = activeProjectOrToast()
    if (!project) return
    downloadText(`${slugify(project.name)}.json`, JSON.stringify(project, null, 2), 'application/json')
    toast.add({ title: 'Exported JSON', color: 'success' })
  }

  function exportWorkspaceFile() {
    const baseName = slugify(ui.activeDatabase?.name ?? 'workspace')
    const filename = `${baseName}.${PROJECT_FILE_EXTENSION}`
    downloadText(filename, serializeProjectFile(workspace.workspace), 'application/json')
    toast.add({ title: `Exported ${filename}`, color: 'success' })
  }

  function exportMermaid() {
    const project = activeProjectOrToast()
    if (!project) return
    downloadText(`${slugify(project.name)}.mmd`, projectToMermaid(project) + '\n', 'text/plain')
    toast.add({ title: 'Exported Mermaid diagram', color: 'success' })
  }

  function exportMarkdown() {
    const project = activeProjectOrToast()
    if (!project) return
    downloadText(`${slugify(project.name)}.md`, projectToMarkdown(project), 'text/markdown')
    toast.add({ title: 'Exported Markdown docs', color: 'success' })
  }

  function currentSvgString(): string {
    return projectToSvg(workspace.workspace, {
      level: ui.state.viewLevel,
      dbId: ui.activeDbId,
      schemaId: ui.activeSchemaId,
      showRelations: ui.state.showRelations,
      showEnums: ui.state.showEnums,
      showTypes: ui.state.showTypes,
      dark: colorMode.value !== 'light'
    })
  }

  function exportSvg() {
    const baseName = slugify(ui.activeDatabase?.name ?? 'diagram')
    downloadText(`${baseName}.svg`, currentSvgString(), 'image/svg+xml')
    toast.add({ title: 'Exported SVG diagram', color: 'success' })
  }

  async function exportPng() {
    const baseName = slugify(ui.activeDatabase?.name ?? 'diagram')
    try {
      await downloadPngFromSvg(`${baseName}.png`, currentSvgString(), 2)
      toast.add({ title: 'Exported 2x PNG diagram', color: 'success' })
    } catch (error) {
      toast.add({
        title: 'PNG export failed',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    }
  }

  function exportMultiFileZip() {
    const project = activeProjectOrToast()
    if (!project) return
    const files = projectToMultiFileBundle(project)
    const zipBytes = createZipBytes(files)
    downloadBytes(`${slugify(project.name)}-bundle.zip`, zipBytes, 'application/zip')
    toast.add({ title: `Exported ZIP (${files.length} files)`, color: 'success' })
  }

  async function exportDesktopFolder() {
    if (!isDesktop) return
    const project = activeProjectOrToast()
    if (!project) return

    try {
      const { pickExportDirectory, writeExportFile } = await import('~/desktop/files')
      const dir = await pickExportDirectory()
      if (!dir) return

      const files = projectToMultiFileBundle(project)
      for (const file of files) {
        await writeExportFile(dir, file.path, file.content)
      }
      toast.add({
        title: `Exported ${files.length} files`,
        description: dir,
        color: 'success'
      })
    } catch (error) {
      toast.add({
        title: 'Folder export failed',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    }
  }

  async function importWorkspaceFile(file: File): Promise<boolean> {
    try {
      const raw = await file.text()
      const parsed = parseProjectFile(raw)
      if (!parsed.ok) {
        toast.add({ title: 'Invalid project file', description: parsed.error, color: 'error' })
        return false
      }

      if (workspace.databases.length > 0) {
        const proceed = await confirm({
          title: 'Replace current workspace?',
          message: `Load "${file.name}" and replace the current workspace?`,
          confirmLabel: 'Replace',
          color: 'primary'
        })
        if (!proceed) return false
      }

      ui.setHasUnappliedCode(false)
      if (desktopDoc) {
        desktopDoc.loadTemplateWorkspace(parsed.workspace)
      } else {
        workspace.replaceWorkspace(parsed.workspace)
      }
      const firstDb = parsed.workspace.databases[0]
      if (firstDb) ui.selectDatabase(firstDb.id)

      toast.add({ title: `Loaded ${file.name}`, color: 'success' })
      return true
    } catch (error) {
      toast.add({
        title: 'Import failed',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
      return false
    }
  }

  async function loadStarterTemplate(project: DatabaseProject, label: string): Promise<boolean> {
    const cloned = JSON.parse(JSON.stringify(project)) as DatabaseProject
    const nextWs = migrateV1ToWorkspace([cloned])

    if (workspace.databases.length > 0 && !(await confirm({
      title: 'Start from template?',
      message: `Load "${label}" template and replace the current workspace?`,
      confirmLabel: 'Load template',
      color: 'primary'
    }))) {
      return false
    }

    ui.setHasUnappliedCode(false)
    if (desktopDoc) {
      desktopDoc.loadTemplateWorkspace(nextWs)
    } else {
      workspace.replaceWorkspace(nextWs)
    }
    const db = nextWs.databases[0]
    if (db) {
      ui.selectDatabase(db.id)
      ui.setViewLevel('tables')
    }
    toast.add({ title: `Loaded "${label}" template`, color: 'success' })
    return true
  }

  function promptWebWorkspaceImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.schemacrafter,.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void importWorkspaceFile(file)
      input.remove()
    }
    input.click()
  }

  return {
    exportSql,
    exportJson,
    exportWorkspaceFile,
    exportMermaid,
    exportMarkdown,
    exportSvg,
    exportPng,
    exportMultiFileZip,
    exportDesktopFolder,
    importWorkspaceFile,
    promptWebWorkspaceImport,
    loadStarterTemplate
  }
}
