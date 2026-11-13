import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm, open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_EXTENSIONS,
  ensureProjectExtension
} from '#shared/utils/projectFile'

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

/** Reads a project file's UTF-8 contents through Tauri FS. */
export function readProjectFile(path: string): Promise<string> {
  return readTextFile(path)
}

/** Writes serialized workspace JSON to a project file through Tauri FS. */
export function writeProjectFile(path: string, content: string): Promise<void> {
  return writeTextFile(path, content)
}

/** Retrieves and clears any project file path passed on desktop startup. */
export function takePendingOpenFile(): Promise<string | null> {
  return invoke<string | null>('take_pending_open_file')
}

/** Subscribes to OS file-open requests delivered after startup. */
export function listenOpenFileRequests(handler: (paths: string[]) => void): Promise<() => void> {
  return listen<string[]>('file-opened', event => handler(event.payload))
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
