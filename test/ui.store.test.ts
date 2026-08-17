// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { UI_STATE_KEY, migrateV1ToWorkspace } from '#shared/utils/migrations'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'
import { TEMPLATES } from './fixtures'

function seeded() {
  const workspace = useWorkspaceStore()
  workspace.replaceWorkspace(migrateV1ToWorkspace(TEMPLATES.map(([, p]) => p)))
  return workspace
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('hydration', () => {
  it('restores the drilled-into database and schema', () => {
    const workspace = seeded()
    const db = workspace.databases[1]!
    const schema = workspace.schemasOfDatabase(db.id)[1]!

    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      activeDbId: db.id,
      activeSchemaId: schema.id,
      viewLevel: 'schemas'
    }))

    const ui = useUiStore()
    ui.hydrate()

    // Both ids default to null, whose typeof is "object". A
    // `typeof saved === typeof default` guard therefore rejected every saved
    // id string, and the canvas silently reopened on the first schema.
    expect(ui.activeDbId).toBe(db.id)
    expect(ui.activeSchemaId).toBe(schema.id)
    expect(ui.state.viewLevel).toBe('schemas')
  })

  it('ignores values that are not part of the vocabulary', () => {
    seeded()
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      viewLevel: 'galaxies',
      railTab: 42,
      codeTarget: 'cobol',
      editable: 'yes'
    }))

    const ui = useUiStore()
    ui.hydrate()

    expect(ui.state.viewLevel).toBe('tables')
    expect(ui.state.railTab).toBe('databases')
    expect(ui.state.codeTarget).toBe('prisma')
    expect(ui.state.editable).toBe(true)
  })

  it('writes state back on change', async () => {
    const workspace = seeded()
    const ui = useUiStore()
    ui.hydrate()

    ui.setViewLevel('databases')
    await nextTick()

    expect(JSON.parse(localStorage.getItem(UI_STATE_KEY)!)).toMatchObject({ viewLevel: 'databases' })
    expect(workspace.databases.length).toBeGreaterThan(0)
  })
})

describe('active selection', () => {
  it('falls back to the first database and its first schema', () => {
    const workspace = seeded()
    const ui = useUiStore()

    expect(ui.activeDbId).toBe(workspace.databases[0]!.id)
    expect(ui.activeSchemaId).toBe(workspace.schemasOfDatabase(workspace.databases[0]!.id)[0]!.id)
  })

  it('drops a schema that belongs to another database', () => {
    const workspace = seeded()
    const ui = useUiStore()
    const [first, second] = workspace.databases

    ui.selectSchema(workspace.schemasOfDatabase(second!.id)[0]!.id)
    expect(ui.activeDbId).toBe(second!.id)

    ui.selectDatabase(first!.id)
    expect(ui.activeSchemaId).toBe(workspace.schemasOfDatabase(first!.id)[0]!.id)
  })
})
