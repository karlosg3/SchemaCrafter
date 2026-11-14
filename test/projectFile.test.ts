import { describe, expect, it } from 'vitest'
import { migrateV1ToWorkspace, reconcileWorkspace } from '#shared/utils/migrations'
import {
  ensureProjectExtension,
  fileNameFromPath,
  parseProjectFile,
  serializeProjectFile
} from '#shared/utils/projectFile'
import { TEMPLATES } from './fixtures'

describe('projectFile', () => {
  it('round-trips a v2 workspace without marking it migrated', () => {
    const workspace = reconcileWorkspace(migrateV1ToWorkspace(TEMPLATES.map(([, p]) => p)))
    const serialized = serializeProjectFile(workspace)
    const result = parseProjectFile(serialized)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migratedFromLegacy).toBe(false)
    expect(result.workspace).toEqual(workspace)
  })

  it('accepts a legacy v1 DatabaseProject[] array and migrates it', () => {
    const projects = TEMPLATES.map(([, p]) => p)
    const result = parseProjectFile(JSON.stringify(projects))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migratedFromLegacy).toBe(true)
    expect(result.workspace.databases).toHaveLength(projects.length)
  })

  it('accepts a single DatabaseProject export from web Download JSON', () => {
    const [, ecommerce] = TEMPLATES[0]!
    const result = parseProjectFile(JSON.stringify(ecommerce))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migratedFromLegacy).toBe(true)
    expect(result.workspace.databases.map(d => d.name)).toEqual([ecommerce.name])
  })

  it('rejects invalid JSON and unsupported payloads', () => {
    expect(parseProjectFile('{ not json')).toEqual({
      ok: false,
      error: 'File does not contain valid JSON.'
    })

    expect(parseProjectFile(JSON.stringify({ hello: 'world' }))).toEqual({
      ok: false,
      error: 'Unsupported or malformed SchemaCrafter project file.'
    })
  })

  it('appends .schemacrafter only when neither .schemacrafter nor .json is present', () => {
    expect(ensureProjectExtension('/home/user/my-app')).toBe('/home/user/my-app.schemacrafter')
    expect(ensureProjectExtension('/home/user/my-app.schemacrafter')).toBe('/home/user/my-app.schemacrafter')
    expect(ensureProjectExtension('/home/user/my-app.SCHEMACRAFTER')).toBe('/home/user/my-app.SCHEMACRAFTER')
    expect(ensureProjectExtension('/home/user/my-app.json')).toBe('/home/user/my-app.json')
    expect(ensureProjectExtension('/home/user/my-app.JSON')).toBe('/home/user/my-app.JSON')
  })

  it('extracts filenames across POSIX and Windows paths', () => {
    expect(fileNameFromPath('/home/k4/schemas/shop.schemacrafter')).toBe('shop.schemacrafter')
    expect(fileNameFromPath('C:\\Users\\k4\\shop.json')).toBe('shop.json')
    expect(fileNameFromPath('workspace.schemacrafter')).toBe('workspace.schemacrafter')
  })
})
