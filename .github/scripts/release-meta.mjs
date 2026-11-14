import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_SITE_ID = '7263f326-7edb-440b-8c01-1004443c47d8'
const DEFAULT_SITE_URL = 'https://schemacrafter.netlify.app'

/**
 * Parses a strict X.Y.Z semver string with optional leading "v".
 * @param {string} raw
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
export function parseSemver(raw) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim())
  if (!match) return null
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  }
}

/**
 * Compares two semver objects numerically.
 * @param {{ major: number, minor: number, patch: number }} a
 * @param {{ major: number, minor: number, patch: number }} b
 * @returns {number}
 */
export function compareSemver(a, b) {
  return (a.major - b.major) || (a.minor - b.minor) || (a.patch - b.patch)
}

/**
 * Formats a semver object as X.Y.Z.
 * @param {{ major: number, minor: number, patch: number }} v
 * @returns {string}
 */
export function formatSemver(v) {
  return `${v.major}.${v.minor}.${v.patch}`
}

/**
 * Computes the next release version & tag from existing Git tags and tauri.conf.json version.
 * Reuses an existing semver tag on HEAD for idempotent reruns; otherwise picks configVersion
 * if strictly greater than all existing tags, or bumps patch from the highest existing tag.
 *
 * @param {readonly string[]} tags
 * @param {string} configVersion
 * @param {readonly string[]} [tagsAtHead]
 * @returns {{ version: string, tag: string, tagExists: boolean }}
 */
export function resolveReleaseVersion(tags, configVersion, tagsAtHead = []) {
  const parsedAtHead = tagsAtHead
    .map(parseSemver)
    .filter(v => v !== null)
    .sort((a, b) => compareSemver(b, a))

  if (parsedAtHead.length > 0) {
    const version = formatSemver(parsedAtHead[0])
    return { version, tag: `v${version}`, tagExists: true }
  }

  const parsedConfig = parseSemver(configVersion)
  if (!parsedConfig) {
    throw new Error(`Invalid version "${configVersion}" in tauri.conf.json; expected X.Y.Z`)
  }

  const parsedTags = tags
    .map(parseSemver)
    .filter(v => v !== null)
    .sort((a, b) => compareSemver(b, a))

  const highest = parsedTags[0] ?? null
  const next = !highest || compareSemver(parsedConfig, highest) > 0
    ? parsedConfig
    : { major: highest.major, minor: highest.minor, patch: highest.patch + 1 }

  const version = formatSemver(next)
  return { version, tag: `v${version}`, tagExists: false }
}

/**
 * Polls Netlify's public site endpoint briefly to recover both the production URL and
 * the immutable commit deploy permalink once Netlify Git CD publishes the commit.
 *
 * @param {{ siteId?: string, sha?: string, fallbackUrl?: string, pollMs?: number, intervalMs?: number, fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ siteUrl: string, permalinkUrl: string | null, matchedCommit: boolean }>}
 */
export async function resolveNetlifyDeployment(options = {}) {
  const siteId = options.siteId || DEFAULT_SITE_ID
  const sha = options.sha || ''
  const fallbackUrl = options.fallbackUrl || DEFAULT_SITE_URL
  const pollMs = options.pollMs ?? 60_000
  const intervalMs = options.intervalMs ?? 5_000
  const fetchFn = options.fetchImpl ?? fetch

  const deadline = Date.now() + pollMs
  let latestSiteUrl = fallbackUrl

  while (true) {
    try {
      const res = await fetchFn(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}`)
      if (res.ok) {
        const data = await res.json()
        const sslUrl = typeof data.ssl_url === 'string' && data.ssl_url ? data.ssl_url : null
        const rawUrl = typeof data.url === 'string' && data.url ? data.url.replace(/^http:\/\//, 'https://') : null
        if (sslUrl || rawUrl) latestSiteUrl = sslUrl || rawUrl

        const published = data.published_deploy
        if (published && sha && published.commit_ref === sha && published.id) {
          const siteSlug = typeof data.name === 'string' && data.name ? data.name : 'schemacrafter'
          return {
            siteUrl: latestSiteUrl,
            permalinkUrl: `https://${published.id}--${siteSlug}.netlify.app`,
            matchedCommit: true
          }
        }
      }
    } catch {
      // Non-fatal: release still publishes with the production URL even if polling fails
    }

    if (!sha || Date.now() >= deadline) {
      return { siteUrl: latestSiteUrl, permalinkUrl: null, matchedCommit: false }
    }
    await new Promise(resolveWait => setTimeout(resolveWait, intervalMs))
  }
}

/**
 * Builds the Markdown release header prepended before GitHub generated notes.
 * @param {{ version: string, tag: string, siteUrl: string, permalinkUrl?: string | null, debFiles: readonly string[], checksums?: string }} input
 * @returns {string}
 */
export function buildReleaseNotes(input) {
  const lines = [
    `## SchemaCrafter ${input.tag}`,
    '',
    '### Web App (Netlify)',
    `- Live production URL: ${input.siteUrl}`
  ]

  if (input.permalinkUrl) {
    lines.push(`- Deploy permalink for this release: ${input.permalinkUrl}`)
  }

  lines.push('', '### Desktop Installer (Linux `.deb`)')
  if (input.debFiles.length > 0) {
    for (const file of input.debFiles) {
      lines.push(`- \`${file}\``)
    }
    lines.push(
      '- Checksums: `SHA256SUMS.txt`',
      '',
      '```bash',
      `sudo apt install ./${input.debFiles[0]}`,
      '```'
    )
  }

  if (input.checksums && input.checksums.trim()) {
    lines.push(
      '',
      '<details>',
      '<summary>SHA-256 Checksums</summary>',
      '',
      '```text',
      input.checksums.trim(),
      '```',
      '</details>'
    )
  }

  lines.push('', '---', '')
  return lines.join('\n')
}

function parseArgs(argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token.startsWith('--') && i + 1 < argv.length) {
      parsed[token.slice(2)] = argv[i + 1]
      i++
    }
  }
  return parsed
}

function listGitTags(extraArgs) {
  const out = execFileSync('git', ['tag', ...extraArgs], { encoding: 'utf8' })
  return out.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

function writeGithubOutput(entries) {
  const outFile = process.env.GITHUB_OUTPUT
  if (!outFile) return
  const payload = Object.entries(entries).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
  appendFileSync(outFile, payload, 'utf8')
}

async function runCli() {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (command === 'resolve') {
    const confPath = resolve(args.config || 'src-tauri/tauri.conf.json')
    const conf = JSON.parse(readFileSync(confPath, 'utf8'))
    const tags = listGitTags(['--list', 'v*'])
    const tagsAtHead = listGitTags(['--points-at', 'HEAD', 'v*'])
    const result = resolveReleaseVersion(tags, conf.version, tagsAtHead)

    writeGithubOutput({
      version: result.version,
      tag: result.tag,
      tag_exists: String(result.tagExists)
    })
    console.log(JSON.stringify(result))
    return
  }

  if (command === 'notes') {
    const assetsDir = resolve(args['assets-dir'] || 'release-assets')
    const outPath = resolve(args.out || 'release-notes.md')
    const files = existsSync(assetsDir) ? readdirSync(assetsDir).sort() : []
    const debFiles = files.filter(name => name.endsWith('.deb'))
    const checksumPath = resolve(assetsDir, 'SHA256SUMS.txt')
    const checksums = existsSync(checksumPath) ? readFileSync(checksumPath, 'utf8') : ''

    const netlify = await resolveNetlifyDeployment({
      siteId: args['site-id'] || DEFAULT_SITE_ID,
      sha: args.sha || ''
    })

    const notes = buildReleaseNotes({
      version: args.version || '',
      tag: args.tag || '',
      siteUrl: netlify.siteUrl,
      permalinkUrl: netlify.permalinkUrl,
      debFiles,
      checksums
    })

    writeFileSync(outPath, notes, 'utf8')
    console.log(`Wrote release notes to ${outPath} (permalink matched: ${netlify.matchedCommit})`)
    return
  }

  throw new Error(`Unknown command "${command || ''}". Expected "resolve" or "notes".`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
