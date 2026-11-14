import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm, open, save } from '@tauri-apps/plugin-dialog'
import { BaseDirectory, exists, mkdir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_EXTENSIONS,
  ensureProjectExtension
} from '#shared/utils/projectFile'

export interface DesktopDragHandlers {
  onHover?: (hoveringSupported: boolean) => void
  onDrop: (path: string) => void
}

function isSupportedProjectPath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.schemacrafter') || lower.endsWith('.json')
}

/** Opens a native file dialog for `.schemacrafter` and `.json` project files. */
export async function pickOpenProjectFile(): Promise<string | null> {
  const selected = await open({
    title: 'Open SchemaCrafter Project',
    multiple: false,
    directory: false,
    filters: [
      { name: 'SchemaCrafter Project', extensions: [...PROJECT_FILE_EXTENSIONS] }
    ]
  })
  return typeof selected === 'string' ? selected : null
}

/** Opens a native save dialog defaulting to `.schemacrafter`. */
export async function pickSaveProjectFile(defaultPath?: string): Promise<string | null> {
  const selected = await save({
    title: 'Save SchemaCrafter Project',
    defaultPath,
    filters: [
      { name: 'SchemaCrafter Project', extensions: [PROJECT_FILE_EXTENSION] },
      { name: 'JSON File', extensions: ['json'] }
    ]
  })
  return selected ? ensureProjectExtension(selected) : null
}

/** Opens a native folder picker (used for multi-file schema export on desktop). */
export async function pickExportDirectory(): Promise<string | null> {
  const selected = await open({
    title: 'Choose Export Folder',
    multiple: false,
    directory: true
  })
  return typeof selected === 'string' ? selected : null
}

/** Reads a project file's UTF-8 contents through Tauri FS. */
export function readProjectFile(path: string): Promise<string> {
  return readTextFile(path)
}

/** Writes serialized workspace JSON to a project file through Tauri FS. */
export function writeProjectFile(path: string, content: string): Promise<void> {
  return writeTextFile(path, content)
}

/** Writes an exported file inside an explicit directory chosen via dialog. */
export async function writeExportFile(baseDir: string, relativePath: string, content: string): Promise<void> {
  const normalized = relativePath.replace(/^\/+/, '')
  const parts = normalized.split('/')
  if (parts.length > 1) {
    const parent = `${baseDir}/${parts.slice(0, -1).join('/')}`
    await mkdir(parent, { recursive: true })
  }
  await writeTextFile(`${baseDir}/${normalized}`, content)
}

/** Reads a JSON/text file inside AppData (used for recent files and crash recovery). */
export async function readAppDataFile(relativePath: string): Promise<string | null> {
  const present = await exists(relativePath, { baseDir: BaseDirectory.AppData })
  if (!present) return null
  return readTextFile(relativePath, { baseDir: BaseDirectory.AppData })
}

/** Writes a JSON/text file inside AppData, creating the directory if needed. */
export async function writeAppDataFile(relativePath: string, content: string): Promise<void> {
  await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {})
  await writeTextFile(relativePath, content, { baseDir: BaseDirectory.AppData })
}

/** Removes a file inside AppData if it exists. */
export async function removeAppDataFile(relativePath: string): Promise<void> {
  const present = await exists(relativePath, { baseDir: BaseDirectory.AppData })
  if (present) await remove(relativePath, { baseDir: BaseDirectory.AppData })
}

/** Grants read scope for a previously opened recent file before reading it. */
export function readRecentProjectFile(path: string): Promise<string> {
  return invoke<string>('allow_and_read_recent_file', { path })
}

/** Retrieves and clears any project file path passed on desktop startup. */
export function takePendingOpenFile(): Promise<string | null> {
  return invoke<string | null>('take_pending_open_file')
}

/** Subscribes to OS file-open requests delivered after startup. */
export function listenOpenFileRequests(handler: (paths: string[]) => void): Promise<() => void> {
  return listen<string[]>('file-opened', event => handler(event.payload))
}

/** Subscribes to drag-and-drop file events over the desktop window. */
export function listenDesktopDragDrop(handlers: DesktopDragHandlers): Promise<() => void> {
  return getCurrentWindow().onDragDropEvent((event) => {
    const payload = event.payload
    if (payload.type === 'enter') {
      handlers.onHover?.(payload.paths.some(isSupportedProjectPath))
    } else if (payload.type === 'leave') {
      handlers.onHover?.(false)
    } else if (payload.type === 'drop') {
      handlers.onHover?.(false)
      const supported = payload.paths.find(isSupportedProjectPath)
      if (supported) handlers.onDrop(supported)
    }
  })
}

/** Updates the native desktop window title. */
export function setDesktopWindowTitle(title: string): Promise<void> {
  return getCurrentWindow().setTitle(title)
}

/** Shows a native confirmation dialog when closing a window with unsaved work. */
export function confirmDesktopClose(message: string): Promise<boolean> {
  return confirm(message, {
    title: 'Unsaved Changes',
    kind: 'warning',
    okLabel: 'Discard & Close',
    cancelLabel: 'Cancel'
  })
}

/** Registers a window close listener that can cancel closing via `preventDefault`. */
export function onDesktopCloseRequested(
  handler: (preventDefault: () => void) => Promise<void> | void
): Promise<() => void> {
  return getCurrentWindow().onCloseRequested(event => handler(() => event.preventDefault()))
}
