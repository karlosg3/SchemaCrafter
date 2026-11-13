import { describe, expect, it } from 'vitest'
import { createZipBytes } from '#shared/utils/zip'
import {
  projectToMarkdown,
  projectToMermaid,
  projectToMultiFileBundle,
  projectToSvg
} from '#shared/utils/exporters'
import { migrateV1ToWorkspace } from '#shared/utils/migrations'
import { ECOMMERCE_TEMPLATE, SAAS_TEMPLATE } from '#shared/utils/templates'

describe('exporters & zip', () => {
  it('generates valid Mermaid ER diagram with tables, keys and relationships', () => {
    const mmd = projectToMermaid(ECOMMERCE_TEMPLATE)
    expect(mmd).toContain('erDiagram')
    expect(mmd).toContain('users {')
    expect(mmd).toContain('orders {')
    expect(mmd).toContain('PK')
    expect(mmd).toContain('FK')
    expect(mmd).toContain('users ||--o{ orders : "user_id"')
  })

  it('generates Markdown documentation with tables, columns, enums and composite indexes', () => {
    const withIdx = {
      ...ECOMMERCE_TEMPLATE,
      tables: ECOMMERCE_TEMPLATE.tables.map((t, i) =>
        i === 0
          ? {
              ...t,
              comment: 'Primary customers table',
              indexes: [{ id: 'idx-1', name: 'idx_users_email', columnNames: ['email'], isUnique: true }]
            }
          : t
      )
    }
    const md = projectToMarkdown(withIdx)
    expect(md).toContain(`# ${ECOMMERCE_TEMPLATE.name}`)
    expect(md).toContain('Primary customers table')
    expect(md).toContain('## Enums')
    expect(md).toContain('`OrderStatus`')
    expect(md).toContain('**Composite Indexes:**')
    expect(md).toContain('`idx_users_email`')
  })

  it('renders standalone dark and light SVG vector diagrams from workspace graph', () => {
    const ws = migrateV1ToWorkspace([ECOMMERCE_TEMPLATE, SAAS_TEMPLATE])
    const db = ws.databases[0]!
    const schemaId = db.schemaIds[0]!

    const darkSvg = projectToSvg(ws, {
      level: 'tables',
      dbId: db.id,
      schemaId,
      showRelations: true,
      showEnums: true,
      showTypes: true,
      dark: true
    })
    expect(darkSvg.startsWith('<svg ')).toBe(true)
    expect(darkSvg).toContain('#0b0e14')
    expect(darkSvg).toContain('users')
    expect(darkSvg).toContain('</svg>')

    const lightSvg = projectToSvg(ws, {
      level: 'tables',
      dbId: db.id,
      schemaId,
      showRelations: true,
      showEnums: true,
      showTypes: true,
      dark: false
    })
    expect(lightSvg).toContain('#f8fafc')
  })

  it('bundles all multi-file outputs and packs valid PKZIP headers', () => {
    const files = projectToMultiFileBundle(ECOMMERCE_TEMPLATE)
    expect(files.map(f => f.path)).toEqual([
      'schema.sql',
      'schema.prisma',
      'drizzle/schema.ts',
      'typeorm/entities.ts',
      'mikroorm/entities.ts',
      'docs/schema.md',
      'docs/diagram.mmd'
    ])

    const zip = createZipBytes(files)
    // Local file header PK\x03\x04
    expect(zip[0]).toBe(0x50)
    expect(zip[1]).toBe(0x4b)
    expect(zip[2]).toBe(0x03)
    expect(zip[3]).toBe(0x04)

    // End of central directory PK\x05\x06 within final 22 bytes
    const eocdOffset = zip.length - 22
    expect(zip[eocdOffset]).toBe(0x50)
    expect(zip[eocdOffset + 1]).toBe(0x4b)
    expect(zip[eocdOffset + 2]).toBe(0x05)
    expect(zip[eocdOffset + 3]).toBe(0x06)
    expect(zip[eocdOffset + 8]).toBe(files.length)
  })
})
