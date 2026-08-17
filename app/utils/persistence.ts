import type { Workspace } from '#shared/types/workspace'
import {
  UI_STATE_KEY,
  V1_PROJECTS_KEY,
  WORKSPACE_KEY,
  isValidV1Payload,
  isValidWorkspace,
  migrateV1ToWorkspace,
  reconcileWorkspace
} from '#shared/utils/migrations'
import { ECOMMERCE_TEMPLATE, SAAS_TEMPLATE } from '#shared/utils/templates'

/**
 * localStorage plumbing.
 *
 * The old storage.ts seeded and *wrote* the templates from inside its read
 * path, and was called from React lazy state initialisers. Loading is a pure
 * read here; seeding is a decision the caller makes and an explicit save.
 */

export type LoadSource = 'v2' | 'migrated-v1' | 'seeded' | 'unavailable'

export interface LoadResult {
  workspace: Workspace
  source: LoadSource
  /** Set when a payload existed but could not be used. */
  warning?: string
}

function storage(): Storage | null {
  try {
    // ssr:false means this always runs in the browser, but a disabled-storage
    // browser still throws on access rather than returning undefined.
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readJson(key: string): unknown {
  const store = storage()
  if (!store) return undefined
  try {
    const raw = store.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function seedWorkspace(): Workspace {
  return migrateV1ToWorkspace([ECOMMERCE_TEMPLATE, SAAS_TEMPLATE])
}

export function loadWorkspace(): LoadResult {
  if (!storage()) {
    return { workspace: seedWorkspace(), source: 'unavailable' }
  }

  const v2 = readJson(WORKSPACE_KEY)
  if (v2 !== undefined) {
    if (isValidWorkspace(v2)) {
      return { workspace: reconcileWorkspace(v2), source: 'v2' }
    }
    return {
      workspace: seedWorkspace(),
      source: 'seeded',
      warning: 'Saved workspace was malformed and could not be loaded. Starting from the templates.'
    }
  }

  // No v2 payload — try upgrading a v1 one. v1 is deliberately left in place as
  // a rollback path rather than deleted.
  const v1 = readJson(V1_PROJECTS_KEY)
  if (v1 !== undefined) {
    if (isValidV1Payload(v1)) {
      const workspace = reconcileWorkspace(migrateV1ToWorkspace(v1))
      saveWorkspace(workspace)
      return { workspace, source: 'migrated-v1' }
    }
    return {
      workspace: seedWorkspace(),
      source: 'seeded',
      warning: 'Previous save data was malformed and could not be migrated. Starting from the templates.'
    }
  }

  return { workspace: seedWorkspace(), source: 'seeded' }
}

export function saveWorkspace(workspace: Workspace): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
  } catch (error) {
    console.error('Failed to save workspace:', error)
  }
}

export function loadUiState<T>(): Partial<T> | undefined {
  const raw = readJson(UI_STATE_KEY)
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Partial<T> : undefined
}

export function saveUiState(state: unknown): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(UI_STATE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save UI state:', error)
  }
}
