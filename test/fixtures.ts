import type { DatabaseProject, ORMTarget } from '#shared/types/schema'
import { ECOMMERCE_TEMPLATE, SAAS_TEMPLATE } from '#shared/utils/templates'

export const TARGETS: ORMTarget[] = ['sql', 'prisma', 'drizzle', 'typeorm', 'mikroorm']

export const TEMPLATES: [name: string, project: DatabaseProject][] = [
  ['ecommerce', ECOMMERCE_TEMPLATE],
  ['saas', SAAS_TEMPLATE]
]

/**
 * A structural view of a project with everything the round trip is *allowed*
 * to lose stripped out: ids, canvas positions and colours. What remains is the
 * information a code format is expected to carry.
 */
export interface NormalizedColumn {
  name: string
  type: string
  enumName?: string
  isPrimaryKey: boolean
  isNullable: boolean
  isUnique: boolean
  isIndexed: boolean
  isAutoIncrement: boolean
  defaultValue?: string
  /** `table.column` rather than an id pair, so it survives id regeneration. */
  references?: string
  onDelete?: string
  onUpdate?: string
}

export interface NormalizedTable {
  name: string
  schema: string
  columns: NormalizedColumn[]
}

export interface NormalizedProject {
  engine: string
  schemas: string[]
  enums: { name: string, values: string[] }[]
  tables: NormalizedTable[]
}

export function normalize(project: DatabaseProject): NormalizedProject {
  const tableById = new Map(project.tables.map(t => [t.id, t]))
  const schemaById = new Map((project.schemas ?? []).map(s => [s.id, s]))

  return {
    engine: project.engine,
    schemas: [...(project.schemas ?? []).map(s => s.name)].sort(),
    enums: [...(project.enums ?? [])]
      .map(e => ({ name: e.name, values: [...e.values] }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tables: [...project.tables]
      .map(table => ({
        name: table.name,
        schema: table.schemaId ? schemaById.get(table.schemaId)?.name ?? '?' : '-',
        columns: table.columns.map((col): NormalizedColumn => {
          const target = col.foreignKey ? tableById.get(col.foreignKey.targetTableId) : undefined
          const targetCol = target?.columns.find(c => c.id === col.foreignKey?.targetColumnId)

          return {
            name: col.name,
            type: col.type,
            ...(col.enumName ? { enumName: col.enumName } : {}),
            isPrimaryKey: !!col.isPrimaryKey,
            isNullable: !!col.isNullable,
            isUnique: !!col.isUnique,
            isIndexed: !!col.isIndexed,
            isAutoIncrement: !!col.isAutoIncrement,
            ...(col.defaultValue ? { defaultValue: col.defaultValue } : {}),
            ...(col.foreignKey
              ? { references: `${target?.name ?? '?'}.${targetCol?.name ?? '?'}` }
              : {}),
            ...(col.foreignKey?.onDelete ? { onDelete: col.foreignKey.onDelete } : {}),
            ...(col.foreignKey?.onUpdate ? { onUpdate: col.foreignKey.onUpdate } : {})
          }
        })
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}
