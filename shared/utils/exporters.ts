import type { Column, DatabaseProject } from '../types/schema'
import type { Workspace } from '../types/workspace'
import { generateCodeForTarget } from '../generators/index'
import { BLOCK, blockHeight, buildGraph, columnIdFromHandle } from './graph'
import type { GraphOptions } from './graph'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeMermaidId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_')
  return /^\d/.test(cleaned) ? `t_${cleaned}` : cleaned
}

function formatColType(col: Column): string {
  if (col.type === 'ENUM' && col.enumName) return col.enumName
  if (col.type === 'VARCHAR' && col.length) return `VARCHAR(${col.length})`
  if (col.type === 'DECIMAL' && (col.precision !== undefined || col.scale !== undefined)) {
    return `DECIMAL(${col.precision ?? 10},${col.scale ?? 2})`
  }
  return col.type
}

/** Exports a DatabaseProject as a Mermaid ER diagram. */
export function projectToMermaid(project: DatabaseProject): string {
  const lines: string[] = ['erDiagram']
  const tableMap = new Map(project.tables.map(t => [t.id, t]))

  for (const table of project.tables) {
    const id = escapeMermaidId(table.name)
    lines.push(`  ${id} {`)
    for (const col of table.columns) {
      const colType = formatColType(col).replace(/[(),\s]/g, '_')
      const flags: string[] = []
      if (col.isPrimaryKey) flags.push('PK')
      if (col.foreignKey) flags.push('FK')
      if (col.isUnique && !col.isPrimaryKey) flags.push('UK')
      const flagStr = flags.length > 0 ? ` ${flags.join(',')}` : ''
      const commentStr = col.comment ? ` "${col.comment.replace(/"/g, "'")}"` : ''
      lines.push(`    ${colType} ${escapeMermaidId(col.name)}${flagStr}${commentStr}`)
    }
    lines.push('  }')
  }

  for (const table of project.tables) {
    const childId = escapeMermaidId(table.name)
    for (const col of table.columns) {
      if (!col.foreignKey) continue
      const target = tableMap.get(col.foreignKey.targetTableId)
      if (!target) continue
      const parentId = escapeMermaidId(target.name)
      const rel = col.isNullable ? '|o--o{' : '||--o{'
      lines.push(`  ${parentId} ${rel} ${childId} : "${col.name}"`)
    }
  }

  return lines.join('\n')
}

/** Exports a DatabaseProject as comprehensive Markdown schema documentation. */
export function projectToMarkdown(project: DatabaseProject): string {
  const schemaMap = new Map(project.schemas.map(s => [s.id, s.name]))
  const tableMap = new Map(project.tables.map(t => [t.id, t]))
  const sections: string[] = [
    `# ${project.name}`,
    '',
    `- **Engine:** \`${project.engine}\``,
    `- **Schemas:** ${project.schemas.map(s => `\`${s.name}\``).join(', ') || 'none'}`,
    `- **Tables:** ${project.tables.length}`,
    `- **Enums:** ${project.enums?.length ?? 0}`,
    ''
  ]

  if (project.enums && project.enums.length > 0) {
    sections.push('## Enums', '')
    for (const en of project.enums) {
      sections.push(`### \`${en.name}\``, '')
      if (en.comment) sections.push(en.comment, '')
      sections.push(`Values: ${en.values.map(v => `\`${v}\``).join(', ')}`, '')
    }
  }

  sections.push('## Tables', '')
  for (const table of project.tables) {
    const schemaName = table.schemaId ? schemaMap.get(table.schemaId) : undefined
    const fqName = schemaName ? `${schemaName}.${table.name}` : table.name
    sections.push(`### \`${fqName}\``, '')
    if (table.comment) sections.push(table.comment, '')

    sections.push('| Column | Type | Nullable | Key / Constraints | Default | Description |')
    sections.push('| :--- | :--- | :---: | :--- | :--- | :--- |')
    for (const col of table.columns) {
      const constraints: string[] = []
      if (col.isPrimaryKey) constraints.push('PK')
      if (col.isAutoIncrement) constraints.push('AUTO')
      if (col.isUnique && !col.isPrimaryKey) constraints.push('UNIQUE')
      if (col.isIndexed) constraints.push('INDEX')
      if (col.foreignKey) {
        const target = tableMap.get(col.foreignKey.targetTableId)
        const targetCol = target?.columns.find(c => c.id === col.foreignKey?.targetColumnId)
        constraints.push(`FK -> \`${target?.name ?? '?'}.${targetCol?.name ?? '?'}\``)
      }
      const def = col.defaultValue ? `\`${col.defaultValue}\`` : '—'
      const desc = col.comment ? col.comment.replace(/\|/g, '\\|') : '—'
      sections.push(
        `| \`${col.name}\` | \`${formatColType(col)}\` | ${col.isNullable ? 'YES' : 'NO'} | ${constraints.join(', ') || '—'} | ${def} | ${desc} |`
      )
    }
    sections.push('')

    if (table.indexes && table.indexes.length > 0) {
      sections.push('**Composite Indexes:**', '')
      for (const idx of table.indexes) {
        const flags = [idx.isUnique ? 'UNIQUE' : null, idx.type ?? null].filter(Boolean).join(' ')
        sections.push(`- \`${idx.name}\` (${idx.columnNames.map(c => `\`${c}\``).join(', ')})${flags ? ` — ${flags}` : ''}`)
      }
      sections.push('')
    }
  }

  return sections.join('\n').trim() + '\n'
}

/** Bundles SQL, Prisma, Drizzle, TypeORM, MikroORM, Markdown and Mermaid files for a project. */
export function projectToMultiFileBundle(project: DatabaseProject): Array<{ path: string, content: string }> {
  return [
    { path: 'schema.sql', content: generateCodeForTarget(project, 'sql') + '\n' },
    { path: 'schema.prisma', content: generateCodeForTarget(project, 'prisma') + '\n' },
    { path: 'drizzle/schema.ts', content: generateCodeForTarget(project, 'drizzle') + '\n' },
    { path: 'typeorm/entities.ts', content: generateCodeForTarget(project, 'typeorm') + '\n' },
    { path: 'mikroorm/entities.ts', content: generateCodeForTarget(project, 'mikroorm') + '\n' },
    { path: 'docs/schema.md', content: projectToMarkdown(project) },
    { path: 'docs/diagram.mmd', content: projectToMermaid(project) + '\n' }
  ]
}

/**
 * Generates a standalone SVG vector export directly from the pure domain graph.
 * Safe in headless Node, Browser, and Linux WebKitGTK without DOM serialization quirks.
 */
export function projectToSvg(
  ws: Workspace,
  options: Omit<GraphOptions, 'editable'> & { dark?: boolean }
): string {
  const dark = options.dark ?? true
  const graph = buildGraph(ws, { ...options, editable: false })

  const bg = dark ? '#0b0e14' : '#f8fafc'
  const blockBg = dark ? '#141923' : '#ffffff'
  const headerBg = dark ? '#1a2130' : '#f1f5f9'
  const borderColor = dark ? '#293246' : '#cbd5e1'
  const rowBorder = dark ? '#1e2636' : '#e2e8f0'
  const textBright = dark ? '#f1f5f9' : '#0f172a'
  const textBody = dark ? '#cbd5e1' : '#334155'
  const textMuted = dark ? '#94a3b8' : '#64748b'
  const badgeBg = dark ? '#1e293b' : '#f1f5f9'
  const badgeStroke = dark ? '#334155' : '#cbd5e1'

  if (graph.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><rect width="640" height="320" fill="${bg}"/><text x="320" y="160" text-anchor="middle" fill="${textMuted}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14">No entities in current view</text></svg>`
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const nodeBoxes = new Map<string, { x: number, y: number, w: number, h: number, rowY: Map<string, number> }>()

  for (const node of graph.nodes) {
    if (node.type === 'block') {
      const w = node.data.size?.width ?? node.data.width
      const h = node.data.size?.height ?? blockHeight(node.data)
      const rowY = new Map<string, number>()
      node.data.rows.forEach((row, idx) => {
        rowY.set(row.id, node.position.y + BLOCK.headerHeight + idx * node.data.rowHeight + node.data.rowHeight / 2)
      })
      nodeBoxes.set(node.id, { x: node.position.x, y: node.position.y, w, h, rowY })
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + w)
      maxY = Math.max(maxY, node.position.y + h)
    } else {
      const w = 136
      const h = 30
      nodeBoxes.set(node.id, { x: node.position.x, y: node.position.y, w, h, rowY: new Map() })
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + w)
      maxY = Math.max(maxY, node.position.y + h)
    }
  }

  const padding = 48
  const vbX = Math.floor(minX - padding)
  const vbY = Math.floor(minY - padding)
  const vbW = Math.ceil(maxX - minX + padding * 2)
  const vbH = Math.ceil(maxY - minY + padding * 2)

  const svgParts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`,
    `<defs>`,
    `<style>.sc-sans{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.sc-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,monospace}</style>`
  ]

  graph.nodes.forEach((node, i) => {
    if (node.type === 'block') {
      svgParts.push(
        `<linearGradient id="grad-${i}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${escapeXml(node.data.gradient[0])}"/><stop offset="100%" stop-color="${escapeXml(node.data.gradient[1])}"/></linearGradient>`,
        `<clipPath id="clip-${i}"><rect x="${node.position.x}" y="${node.position.y}" width="${node.data.size?.width ?? node.data.width}" height="${node.data.size?.height ?? blockHeight(node.data)}" rx="10"/></clipPath>`
      )
    }
  })

  svgParts.push(`</defs>`, `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${bg}"/>`)

  // Edges first (under blocks)
  for (const edge of graph.edges) {
    const srcBox = nodeBoxes.get(edge.source)
    const dstBox = nodeBoxes.get(edge.target)
    if (!srcBox || !dstBox) continue

    const srcColId = columnIdFromHandle(edge.sourceHandle)
    const dstColId = columnIdFromHandle(edge.targetHandle)

    const sx = srcBox.x + srcBox.w
    const sy: number = (srcColId ? srcBox.rowY.get(srcColId) : undefined) ?? (srcBox.y + srcBox.h / 2)
    const tx = dstBox.x
    const ty: number = (dstColId ? dstBox.rowY.get(dstColId) : undefined) ?? (dstBox.y + dstBox.h / 2)

    const dx = Math.max(48, Math.abs(tx - sx) * 0.45)
    const pathD = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`
    const stroke = edge.data.kind === 'enum'
      ? '#ec4899'
      : edge.data.kind === 'cross'
        ? '#f59e0b'
        : '#6366f1'
    const dash = edge.data.kind === 'cross' ? ' stroke-dasharray="5 4"' : ''
    svgParts.push(`<path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="${edge.data.width}"${dash} stroke-opacity="0.85"/>`)

    if (edge.data.label) {
      const lx = Math.round((sx + tx) / 2)
      const ly = Math.round((sy + ty) / 2)
      svgParts.push(
        `<rect x="${lx - 18}" y="${ly - 9}" width="36" height="18" rx="4" fill="${bg}"/>`,
        `<text x="${lx}" y="${ly + 3}" text-anchor="middle" fill="${textMuted}" class="sc-mono" font-size="10">${escapeXml(edge.data.label)}</text>`
      )
    }
  }

  // Nodes
  graph.nodes.forEach((node, i) => {
    const box = nodeBoxes.get(node.id)!
    if (node.type === 'stub') {
      svgParts.push(
        `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="6" fill="${blockBg}" stroke="#f59e0b" stroke-dasharray="4 3"/>`,
        `<text x="${box.x + 10}" y="${box.y + 19}" fill="${textBody}" class="sc-mono" font-size="11">${escapeXml(node.data.label)}</text>`
      )
      return
    }

    const d = node.data
    svgParts.push(`<g clip-path="url(#clip-${i})">`)
    svgParts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${blockBg}"/>`)
    svgParts.push(`<rect x="${box.x}" y="${box.y + 3}" width="${box.w}" height="37" fill="${headerBg}"/>`)
    svgParts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="3" fill="url(#grad-${i})"/>`)
    svgParts.push(`<line x1="${box.x}" y1="${box.y + 40}" x2="${box.x + box.w}" y2="${box.y + 40}" stroke="${rowBorder}"/>`)
    svgParts.push(
      `<text x="${box.x + 12}" y="${box.y + 26}" fill="${textBright}" class="${d.kind === 'database' ? 'sc-sans' : 'sc-mono'}" font-weight="600" font-size="12.5">${escapeXml(d.name)}</text>`
    )

    d.rows.forEach((row, rIdx) => {
      const ry = box.y + BLOCK.headerHeight + rIdx * d.rowHeight
      if (ry + d.rowHeight > box.y + box.h) return
      if (rIdx > 0) {
        svgParts.push(`<line x1="${box.x}" y1="${ry}" x2="${box.x + box.w}" y2="${ry}" stroke="${rowBorder}"/>`)
      }
      const labelX = box.x + (row.isPrimaryKey ? 24 : 12)
      if (row.isPrimaryKey) {
        svgParts.push(`<circle cx="${box.x + 14}" cy="${ry + d.rowHeight / 2}" r="3" fill="#f59e0b"/>`)
      }
      svgParts.push(
        `<text x="${labelX}" y="${ry + d.rowHeight / 2 + 4}" fill="${textBody}" class="sc-mono" font-size="11.5">${escapeXml(row.label)}</text>`
      )
      if (row.badge) {
        const bw = Math.max(36, row.badge.length * 6.4 + 12)
        const bx = box.x + box.w - bw - 10
        const by = ry + (d.rowHeight - 18) / 2
        svgParts.push(
          `<rect x="${bx}" y="${by}" width="${bw}" height="18" rx="4" fill="${badgeBg}" stroke="${badgeStroke}"/>`,
          `<text x="${bx + bw / 2}" y="${by + 12}" text-anchor="middle" fill="${textMuted}" class="sc-mono" font-size="9.5">${escapeXml(row.badge)}</text>`
        )
      }
    })

    svgParts.push(`</g>`)
    svgParts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="none" stroke="${borderColor}" stroke-width="1"/>`)
  })

  svgParts.push('</svg>')
  return svgParts.join('\n')
}
