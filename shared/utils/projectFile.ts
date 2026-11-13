import type { Workspace } from '../types/workspace'
import {
  isValidV1Payload,
  isValidWorkspace,
  migrateV1ToWorkspace,
  reconcileWorkspace
} from './migrations'

export const PROJECT_FILE_EXTENSION = 'schemacrafter'
export const PROJECT_FILE_EXTENSIONS = [PROJECT_FILE_EXTENSION, 'json'] as const

export type ProjectFileLoadResult
  = | { ok: true, workspace: Workspace, migratedFromLegacy: boolean }
    | { ok: false, error: string }

/**
 * Serializes a normalized Workspace v2 payload as readable JSON for
 * `.schemacrafter` and `.json` project files.
 */
export function serializeProjectFile(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2)
}

/**
 * Parses and validates a `.schemacrafter` or `.json` file payload.
 * Accepts canonical Workspace v2 files, legacy v1 `DatabaseProject[]` arrays,
 * and single `DatabaseProject` exports from the web app's Download JSON menu.
 */
export function parseProjectFile(raw: string): ProjectFileLoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'File does not contain valid JSON.' }
  }

  if (isValidWorkspace(parsed)) {
    return {
      ok: true,
      workspace: reconcileWorkspace(parsed),
      migratedFromLegacy: false
    }
  }

  if (isValidV1Payload(parsed)) {
    return {
      ok: true,
      workspace: reconcileWorkspace(migrateV1ToWorkspace(parsed)),
      migratedFromLegacy: true
    }
  }

  // Web "Download JSON" exports a single DatabaseProject object rather than an array.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const single = [parsed]
    if (isValidV1Payload(single)) {
      return {
        ok: true,
        workspace: reconcileWorkspace(migrateV1ToWorkspace(single)),
        migratedFromLegacy: true
      }
    }
  }

  return { ok: false, error: 'Unsupported or malformed SchemaCrafter project file.' }
}

/** Extracts the file name from a POSIX or Windows path. */
export function fileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

/**
 * Appends `.schemacrafter` when the chosen save path has neither `.schemacrafter`
 * nor `.json`, since some Linux file save dialogs omit the filter extension.
 */
export function ensureProjectExtension(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith(`.${PROJECT_FILE_EXTENSION}`) || lower.endsWith('.json')) {
    return filePath
  }
  return `${filePath}.${PROJECT_FILE_EXTENSION}`
}
