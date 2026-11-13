// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_KEY, migrateV1ToWorkspace } from '#shared/utils/migrations'
import { serializeProjectFile } from '#shared/utils/projectFile'
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { useWorkspaceStore } from '~/stores/workspace'
import { TEMPLATES } from './fixtures'

const mocks = vi.hoisted(() => ({
  pickOpenProjectFile: vi.fn<() => Promise<string | null>>(),
  pickSaveProjectFile: vi.fn<(defaultPath?: string) => Promise<string | null>>(),
  readProjectFile: vi.fn<(path: string) => Promise<string>>(),
  writeProjectFile: vi.fn<(path: string, content: string) => Promise<void>>()
}))

vi.mock('~/utils/desktopFiles', () => ({
  pickOpenProjectFile: mocks.pickOpenProjectFile,
  pickSaveProjectFile: mocks.pickSaveProjectFile,
  readProjectFile: mocks.readProjectFile,
  writeProjectFile: mocks.writeProjectFile
}))

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.clearAllMocks()
})

describe('desktopDocument store', () => {
  it('starts empty in file mode without touching localStorage on edits', () => {
    const workspace = useWorkspaceStore()
    const doc = useDesktopDocumentStore()

    workspace.hydrateDesktopEmpty()
    doc.syncSavedRevision()

    expect(workspace.persistenceMode).toBe('file')
    expect(workspace.databases).toHaveLength(0)
    expect(doc.isDirty).toBe(false)
    expect(doc.fileName).toBe('Untitled')

    workspace.createDatabase('Billing', 'postgresql')
    workspace.flush()

    expect(doc.isDirty).toBe(true)
    expect(doc.windowTitle).toBe('• Untitled — SchemaCrafter')
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
  })

  it('saves via Save As on an untitled workspace and clears dirty state', async () => {
    const workspace = useWorkspaceStore()
    const doc = useDesktopDocumentStore()

    workspace.hydrateDesktopEmpty()
    doc.syncSavedRevision()
    workspace.createDatabase('Billing', 'postgresql')

    mocks.pickSaveProjectFile.mockResolvedValue('/tmp/billing.schemacrafter')
    mocks.writeProjectFile.mockResolvedValue()

    const result = await doc.saveFile()

    expect(result).toEqual({ ok: true, fileName: 'billing.schemacrafter' })
    expect(mocks.pickSaveProjectFile).toHaveBeenCalledWith('billing.schemacrafter')
    expect(mocks.writeProjectFile).toHaveBeenCalledWith(
      '/tmp/billing.schemacrafter',
      serializeProjectFile(workspace.workspace)
    )
    expect(doc.currentFilePath).toBe('/tmp/billing.schemacrafter')
    expect(doc.isDirty).toBe(false)
    expect(doc.windowTitle).toBe('billing.schemacrafter — SchemaCrafter')

    // Subsequent save writes directly without reopening Save As.
    workspace.createDatabase('Analytics', 'sqlite')
    expect(doc.isDirty).toBe(true)

    const secondSave = await doc.saveFile()
    expect(secondSave).toEqual({ ok: true, fileName: 'billing.schemacrafter' })
    expect(mocks.pickSaveProjectFile).toHaveBeenCalledTimes(1)
    expect(doc.isDirty).toBe(false)
  })

  it('opens a .schemacrafter workspace cleanly without modifying localStorage', async () => {
    const workspace = useWorkspaceStore()
    const doc = useDesktopDocumentStore()
    workspace.hydrateDesktopEmpty()
    doc.syncSavedRevision()

    const saved = migrateV1ToWorkspace([TEMPLATES[0]![1]])
    mocks.readProjectFile.mockResolvedValue(serializeProjectFile(saved))

    const result = await doc.openPath('/tmp/ecommerce.schemacrafter')

    expect(result).toEqual({
      ok: true,
      migratedFromLegacy: false,
      fileName: 'ecommerce.schemacrafter'
    })
    expect(doc.currentFilePath).toBe('/tmp/ecommerce.schemacrafter')
    expect(doc.isDirty).toBe(false)
    expect(workspace.databases.map(d => d.name)).toEqual([TEMPLATES[0]![1].name])
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
  })

  it('opens a web single-database .json export as a dirty untitled workspace so Save As preserves the original', async () => {
    const workspace = useWorkspaceStore()
    const doc = useDesktopDocumentStore()
    workspace.hydrateDesktopEmpty()
    doc.syncSavedRevision()

    const [, ecommerce] = TEMPLATES[0]!
    mocks.readProjectFile.mockResolvedValue(JSON.stringify(ecommerce))

    const result = await doc.openPath('/tmp/ecommerce-web-export.json')

    expect(result).toEqual({
      ok: true,
      migratedFromLegacy: true,
      fileName: 'ecommerce-web-export.json'
    })
    expect(doc.currentFilePath).toBeNull()
    expect(doc.isDirty).toBe(true)
    expect(workspace.databases.map(d => d.name)).toEqual([ecommerce.name])
  })

  it('preserves current workspace when opening an invalid file', async () => {
    const workspace = useWorkspaceStore()
    const doc = useDesktopDocumentStore()
    workspace.hydrateDesktopEmpty()
    doc.syncSavedRevision()
    workspace.createDatabase('KeepMe', 'postgresql')

    mocks.readProjectFile.mockResolvedValue('not valid json')

    const result = await doc.openPath('/tmp/broken.schemacrafter')

    expect(result).toEqual({
      ok: false,
      error: 'File does not contain valid JSON.'
    })
    expect(workspace.databases.map(d => d.name)).toEqual(['KeepMe'])
    expect(doc.isDirty).toBe(true)
  })
})
