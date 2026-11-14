import { describe, expect, it } from 'vitest'
import {
  buildReleaseNotes,
  parseSemver,
  resolveNetlifyDeployment,
  resolveReleaseVersion
} from '../.github/scripts/release-meta.mjs'

describe('release-meta helpers', () => {
  it('parses strict X.Y.Z semver strings with or without v prefix', () => {
    expect(parseSemver('v1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 })
    expect(parseSemver('2.4.19')).toEqual({ major: 2, minor: 4, patch: 19 })
    expect(parseSemver('v1.0.0-rc.1')).toBeNull()
    expect(parseSemver('release-latest')).toBeNull()
  })

  it('auto-increments patch numerically over the highest existing tag', () => {
    expect(resolveReleaseVersion(['v1.0.0', 'v1.0.9', 'v1.0.10', 'legacy-tag'], '0.1.0')).toEqual({
      version: '1.0.11',
      tag: 'v1.0.11',
      tagExists: false
    })
  })

  it('uses tauri.conf.json version directly when bumped higher than existing tags', () => {
    expect(resolveReleaseVersion(['v1.0.0', 'v1.0.5'], '1.2.0')).toEqual({
      version: '1.2.0',
      tag: 'v1.2.0',
      tagExists: false
    })
  })

  it('falls back to tauri.conf.json version when no semver tags exist yet', () => {
    expect(resolveReleaseVersion([], '0.1.0')).toEqual({
      version: '0.1.0',
      tag: 'v0.1.0',
      tagExists: false
    })
  })

  it('reuses an existing semver tag on HEAD for idempotent reruns', () => {
    expect(resolveReleaseVersion(['v1.0.0', 'v1.0.1'], '0.1.0', ['v1.0.1'])).toEqual({
      version: '1.0.1',
      tag: 'v1.0.1',
      tagExists: true
    })
  })

  it('extracts Netlify site URL and immutable deploy permalink when commit matches', async () => {
    const fakeFetch: typeof fetch = async () => new Response(
      JSON.stringify({
        name: 'schemacrafter',
        ssl_url: 'https://schemacrafter.netlify.app',
        published_deploy: {
          id: 'abc123deploy',
          commit_ref: 'deadbeef'
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

    const result = await resolveNetlifyDeployment({
      siteId: 'test-site',
      sha: 'deadbeef',
      pollMs: 100,
      intervalMs: 10,
      fetchImpl: fakeFetch
    })

    expect(result).toEqual({
      siteUrl: 'https://schemacrafter.netlify.app',
      permalinkUrl: 'https://abc123deploy--schemacrafter.netlify.app',
      matchedCommit: true
    })
  })

  it('falls back gracefully to primary Netlify URL on timeout or network error', async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error('network down')
    }

    const result = await resolveNetlifyDeployment({
      siteId: 'test-site',
      sha: 'deadbeef',
      pollMs: 0,
      intervalMs: 1,
      fetchImpl: failingFetch
    })

    expect(result).toEqual({
      siteUrl: 'https://schemacrafter.netlify.app',
      permalinkUrl: null,
      matchedCommit: false
    })
  })

  it('formats Markdown release notes with Netlify links, .deb filename and checksums', () => {
    const md = buildReleaseNotes({
      version: '1.0.1',
      tag: 'v1.0.1',
      siteUrl: 'https://schemacrafter.netlify.app',
      permalinkUrl: 'https://abc123--schemacrafter.netlify.app',
      debFiles: ['SchemaCrafter_1.0.1_amd64.deb'],
      checksums: '0123abcd  SchemaCrafter_1.0.1_amd64.deb'
    })

    expect(md).toContain('https://schemacrafter.netlify.app')
    expect(md).toContain('https://abc123--schemacrafter.netlify.app')
    expect(md).toContain('SchemaCrafter_1.0.1_amd64.deb')
    expect(md).toContain('sudo apt install ./SchemaCrafter_1.0.1_amd64.deb')
    expect(md).toContain('0123abcd  SchemaCrafter_1.0.1_amd64.deb')
  })
})
