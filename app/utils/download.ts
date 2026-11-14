import type { ORMTarget } from '#shared/types/schema'
import { slugify } from '#shared/utils/ids'

/** Extension per target. TypeScript for the three entity-class ORMs. */
const EXTENSION: Record<ORMTarget, string> = {
  sql: 'sql',
  prisma: 'prisma',
  drizzle: 'ts',
  typeorm: 'ts',
  mikroorm: 'ts'
}

/**
 * Audit CE-11: filenames were per-target constants, so MikroORM and TypeORM
 * both wrote `entities.ts` and exporting two projects in a row silently
 * overwrote the first download.
 */
export function codeFileName(projectName: string, target: ORMTarget): string {
  return `${slugify(projectName)}.${target}.${EXTENSION[target]}`
}

export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  triggerBlobDownload(filename, blob)
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  triggerBlobDownload(filename, new Blob([copy], { type: mime }))
}

function parseSvgDimensions(svg: string): { width: number, height: number } {
  const vb = /viewBox="[^"]*?\s([0-9.]+)\s+([0-9.]+)"/.exec(svg)
  if (vb?.[1] && vb[2]) {
    return {
      width: Math.max(1, Math.ceil(Number.parseFloat(vb[1]))),
      height: Math.max(1, Math.ceil(Number.parseFloat(vb[2])))
    }
  }
  const w = /width="([0-9.]+)"/.exec(svg)?.[1]
  const h = /height="([0-9.]+)"/.exec(svg)?.[1]
  return {
    width: w ? Math.max(1, Math.ceil(Number.parseFloat(w))) : 1200,
    height: h ? Math.max(1, Math.ceil(Number.parseFloat(h))) : 800
  }
}

/** Rasterizes a standalone SVG diagram at 2x scale onto a PNG download. */
export function downloadPngFromSvg(filename: string, svg: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const { width, height } = parseSvgDimensions(svg)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(8192, Math.round(width * scale))
      canvas.height = Math.min(8192, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D context is unavailable'))
        return
      }
      ctx.scale(canvas.width / width, canvas.height / height)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to encode PNG image'))
          return
        }
        triggerBlobDownload(filename, blob)
        resolve()
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('Failed to render SVG image for PNG export'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
