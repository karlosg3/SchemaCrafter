import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  InstallUpdateResult,
  UpdateCheckResult,
  UpdateProgressEvent
} from '~/desktop/updater'

const updaterMocks = vi.hoisted(() => ({
  checkDesktopUpdates: vi.fn<() => Promise<UpdateCheckResult>>(),
  installDebUpdate: vi.fn<() => Promise<InstallUpdateResult>>(),
  restartDesktopApp: vi.fn<() => Promise<void>>(),
  openExternalUrl: vi.fn<(url: string) => Promise<void>>(),
  listenUpdateProgress: vi.fn<(cb: (e: UpdateProgressEvent) => void) => Promise<() => void>>()
}))

vi.mock('~/desktop/updater', () => updaterMocks)

const { formatBytes, useUpdaterStore } = await import('~/stores/updater')

const SAMPLE_AVAILABLE: UpdateCheckResult = {
  currentVersion: '1.0.2',
  latestVersion: '1.0.3',
  tag: 'v1.0.3',
  updateAvailable: true,
  releaseUrl: 'https://github.com/karlosg3/SchemaCrafter/releases/tag/v1.0.3',
  releaseNotes: '## SchemaCrafter v1.0.3\n- New Blueprint UI',
  publishedAt: '2026-11-19T12:00:00Z',
  assetName: 'SchemaCrafter_1.0.3_amd64.deb',
  assetUrl: 'https://github.com/karlosg3/SchemaCrafter/releases/download/v1.0.3/SchemaCrafter_1.0.3_amd64.deb',
  assetSize: 12_500_000,
  checksumUrl: 'https://github.com/karlosg3/SchemaCrafter/releases/download/v1.0.3/SHA256SUMS.txt',
  canAutoInstall: true
}

describe('useUpdaterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    updaterMocks.listenUpdateProgress.mockResolvedValue(() => {})
  })

  it('formats byte sizes cleanly for update UI', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(12_582_912)).toBe('12 MB')
  })

  it('detects available updates silently without opening modal and supports dismiss', async () => {
    updaterMocks.checkDesktopUpdates.mockResolvedValue(SAMPLE_AVAILABLE)
    const store = useUpdaterStore()

    const result = await store.checkForUpdates({ silent: true })
    expect(result?.tag).toBe('v1.0.3')
    expect(store.status).toBe('available')
    expect(store.updateAvailable).toBe(true)
    expect(store.shouldNotify).toBe(true)
    expect(store.modalOpen).toBe(false)

    store.dismissCurrentUpdate()
    expect(store.shouldNotify).toBe(false)
    expect(localStorage.getItem('schemacrafter_dismissed_update_tag')).toBe('v1.0.3')
  })

  it('reports up-to-date when latest matches installed version', async () => {
    updaterMocks.checkDesktopUpdates.mockResolvedValue({
      ...SAMPLE_AVAILABLE,
      latestVersion: '1.0.2',
      tag: 'v1.0.2',
      updateAvailable: false
    })
    const store = useUpdaterStore()

    await store.checkForUpdates()
    expect(store.modalOpen).toBe(true)
    expect(store.status).toBe('up-to-date')
    expect(store.updateAvailable).toBe(false)
  })

  it('streams download progress and transitions to installed on success', async () => {
    updaterMocks.checkDesktopUpdates.mockResolvedValue(SAMPLE_AVAILABLE)
    const unlisten = vi.fn()
    let emitProgress: ((e: UpdateProgressEvent) => void) | null = null
    updaterMocks.listenUpdateProgress.mockImplementation(async (cb) => {
      emitProgress = cb
      return unlisten
    })
    updaterMocks.installDebUpdate.mockImplementation(async () => {
      emitProgress?.({ stage: 'downloading', downloadedBytes: 6_250_000, totalBytes: 12_500_000, percent: 50 })
      emitProgress?.({ stage: 'verifying', downloadedBytes: 12_500_000, totalBytes: 12_500_000, percent: 100 })
      emitProgress?.({ stage: 'installing', downloadedBytes: 12_500_000, totalBytes: 12_500_000, percent: 100 })
      return { status: 'installed', downloadedPath: null, installCommand: null, message: 'OK' }
    })

    const store = useUpdaterStore()
    await store.checkForUpdates({ silent: true })
    const res = await store.installUpdate()

    expect(res?.status).toBe('installed')
    expect(store.status).toBe('installed')
    expect(store.progress.percent).toBe(100)
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('returns to available when user cancels system auth and supports manual fallback', async () => {
    updaterMocks.checkDesktopUpdates.mockResolvedValue(SAMPLE_AVAILABLE)
    const store = useUpdaterStore()
    await store.checkForUpdates({ silent: true })

    updaterMocks.installDebUpdate.mockResolvedValueOnce({
      status: 'cancelled',
      downloadedPath: '/tmp/schemacrafter-updates/SchemaCrafter_1.0.3_amd64.deb',
      installCommand: 'sudo apt install -y "/tmp/schemacrafter-updates/SchemaCrafter_1.0.3_amd64.deb"',
      message: 'Authentication was cancelled.'
    })
    await store.installUpdate()
    expect(store.status).toBe('available')

    updaterMocks.installDebUpdate.mockResolvedValueOnce({
      status: 'manual',
      downloadedPath: '/tmp/schemacrafter-updates/SchemaCrafter_1.0.3_amd64.deb',
      installCommand: 'sudo apt install -y "/tmp/schemacrafter-updates/SchemaCrafter_1.0.3_amd64.deb"',
      message: 'pkexec unavailable'
    })
    await store.installUpdate()
    expect(store.status).toBe('manual')
    expect(store.manualInfo?.installCommand).toContain('sudo apt install')
  })

  it('keeps silent errors quiet and surfaces interactive errors', async () => {
    updaterMocks.checkDesktopUpdates.mockRejectedValue(new Error('offline'))
    const store = useUpdaterStore()

    await store.checkForUpdates({ silent: true })
    expect(store.status).toBe('idle')
    expect(store.modalOpen).toBe(false)

    await store.checkForUpdates({ silent: false })
    expect(store.status).toBe('error')
    expect(store.error).toBe('offline')
    expect(store.modalOpen).toBe(true)
  })
})
