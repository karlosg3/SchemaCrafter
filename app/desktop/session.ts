import type { Workspace } from '#shared/types/workspace'
import { fileNameFromPath, parseProjectFile, serializeProjectFile } from '#shared/utils/projectFile'

const RECENT_FILES_PATH = 'recent-files.json'
const RECOVERY_DRAFT_PATH = 'recovery-draft.schemacrafter'
const MAX_RECENT_FILES = 8

export interface RecentFileEntry {
  path: string
  name: string
  openedAt: string
}

interface RecoveryDraftPayload {
  formatVersion: 1
  savedAt: string
  sourcePath: string | null
  workspaceJson: string
}

export interface RecoveryDraftResult {
  savedAt: string
  sourcePath: string | null
  workspace: Workspace
}

let filesModulePromise: Promise<typeof import('./files')> | null = null
function loadFilesModule() {
  return (filesModulePromise ??= import('./files'))
}

export async function loadRecentFiles(): Promise<RecentFileEntry[]> {
  try {
    const files = await loadFilesModule()
    if (typeof files.readAppDataFile !== 'function') return []
    const raw = await files.readAppDataFile(RECENT_FILES_PATH)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is RecentFileEntry =>
      Boolean(item)
      && typeof item.path === 'string'
      && typeof item.name === 'string'
      && typeof item.openedAt === 'string'
    )
  } catch {
    return []
  }
}

async function persistRecentFiles(entries: RecentFileEntry[]): Promise<void> {
  try {
    const files = await loadFilesModule()
    if (typeof files.writeAppDataFile !== 'function') return
    await files.writeAppDataFile(RECENT_FILES_PATH, JSON.stringify(entries.slice(0, MAX_RECENT_FILES), null, 2))
  } catch {
    // AppData writes are best-effort metadata; never block editor actions.
  }
}

export async function recordRecentFile(path: string): Promise<RecentFileEntry[]> {
  const existing = await loadRecentFiles()
  const next: RecentFileEntry[] = [
    {
      path,
      name: fileNameFromPath(path),
      openedAt: new Date().toISOString()
    },
    ...existing.filter(e => e.path !== path)
  ].slice(0, MAX_RECENT_FILES)
  await persistRecentFiles(next)
  return next
}

export async function removeRecentFile(path: string): Promise<RecentFileEntry[]> {
  const existing = await loadRecentFiles()
  const next = existing.filter(e => e.path !== path)
  await persistRecentFiles(next)
  return next
}

export async function saveRecoveryDraft(workspace: Workspace, sourcePath: string | null): Promise<void> {
  try {
    const files = await loadFilesModule()
    if (typeof files.writeAppDataFile !== 'function') return
    const payload: RecoveryDraftPayload = {
      formatVersion: 1,
      savedAt: new Date().toISOString(),
      sourcePath,
      workspaceJson: serializeProjectFile(workspace)
    }
    await files.writeAppDataFile(RECOVERY_DRAFT_PATH, JSON.stringify(payload))
  } catch {
    // Best-effort crash recovery draft.
  }
}

export async function loadRecoveryDraft(): Promise<RecoveryDraftResult | null> {
  try {
    const files = await loadFilesModule()
    if (typeof files.readAppDataFile !== 'function') return null
    const raw = await files.readAppDataFile(RECOVERY_DRAFT_PATH)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RecoveryDraftPayload>
    if (parsed.formatVersion !== 1 || typeof parsed.workspaceJson !== 'string' || typeof parsed.savedAt !== 'string') {
      return null
    }
    const projectResult = parseProjectFile(parsed.workspaceJson)
    if (!projectResult.ok) return null
    return {
      savedAt: parsed.savedAt,
      sourcePath: typeof parsed.sourcePath === 'string' ? parsed.sourcePath : null,
      workspace: projectResult.workspace
    }
  } catch {
    return null
  }
}

export async function clearRecoveryDraft(): Promise<void> {
  try {
    const files = await loadFilesModule()
    if (typeof files.removeAppDataFile !== 'function') return
    await files.removeAppDataFile(RECOVERY_DRAFT_PATH)
  } catch {
    // Ignore missing/locked draft file cleanup failures.
  }
}
