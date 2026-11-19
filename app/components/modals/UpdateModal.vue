<script setup lang="ts">
import { useDesktopDocumentStore } from '~/stores/desktopDocument'
import { formatBytes, useUpdaterStore } from '~/stores/updater'

const updater = useUpdaterStore()
const isDesktop = isDesktopApp()
const desktopDoc = isDesktop ? useDesktopDocumentStore() : null
const desktopActions = isDesktop ? useDesktopDocumentActions() : null
const confirm = useConfirm()
const toast = useToast()

const publishedDate = computed(() => {
  const iso = updater.info?.publishedAt
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return iso
  }
})

const progressLabel = computed(() => {
  if (updater.status === 'downloading') {
    const pct = updater.progress.percent
    const dl = formatBytes(updater.progress.downloadedBytes)
    const tot = updater.progress.totalBytes ? ` / ${formatBytes(updater.progress.totalBytes)}` : ''
    return pct !== null ? `Downloading package (${pct}%) · ${dl}${tot}` : `Downloading package · ${dl}`
  }
  if (updater.status === 'verifying') return 'Verifying SHA-256 integrity checksum…'
  if (updater.status === 'installing') return 'Installing .deb package (confirm system password prompt)…'
  return ''
})

async function copyManualCommand() {
  const cmd = updater.manualInfo?.installCommand
  if (!cmd) return
  if (await copyText(cmd)) {
    toast.add({ title: 'Install command copied', color: 'success' })
  }
}

async function onRestartNow() {
  if (desktopDoc?.isDirty) {
    const discard = await confirm({
      title: 'Unsaved changes before restart',
      message: `You have unsaved changes in "${desktopDoc.fileName}". Restart now without saving?`,
      confirmLabel: 'Discard & Restart'
    })
    if (!discard) return
  }

  try {
    const session = await import('~/desktop/session')
    await session.clearRecoveryDraft()
  } catch {
    // Non-fatal
  }

  await updater.restartApp()
}

async function onSaveAndRestart() {
  if (!desktopActions) {
    await onRestartNow()
    return
  }
  const saved = await desktopActions.saveFile()
  if (!saved) return
  await updater.restartApp()
}
</script>

<template>
  <UModal
    v-model:open="updater.modalOpen"
    title="Software Updates"
    description="Check GitHub Releases and upgrade SchemaCrafter safely with SHA-256 verification."
    :ui="{ content: 'max-w-lg border border-line-panel bg-[#0E1E35] [.light_&]:bg-surface-block' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Brand & version header -->
        <div class="flex items-center gap-3.5 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised px-3.5 py-3">
          <BrandMark size-class="size-10" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[13.5px] font-semibold text-ink-bright">SchemaCrafter</span>
              <span
                v-if="updater.info"
                class="rounded border border-line-panel bg-surface-chrome px-1.5 py-0.5 font-mono tabular-nums text-[10.5px] text-ink-muted"
              >
                v{{ updater.info.currentVersion }}
              </span>
              <template v-if="updater.updateAvailable && updater.info">
                <UIcon name="i-ph-arrow-right" class="size-3 text-accent-400 [.light_&]:text-accent-600" />
                <span class="rounded border border-accent-500/45 bg-accent-500/18 px-1.5 py-0.5 font-mono tabular-nums text-[10.5px] font-semibold text-accent-300 [.light_&]:text-accent-700">
                  {{ updater.info.tag }}
                </span>
              </template>
            </div>
            <p class="text-[11.5px] text-ink-dim mt-0.5">
              <template v-if="updater.status === 'checking'">
                Checking GitHub Releases…
              </template>
              <template v-else-if="updater.status === 'installed'">
                Upgrade installed — restart to launch {{ updater.info?.tag }}.
              </template>
              <template v-else-if="updater.updateAvailable && publishedDate">
                Released {{ publishedDate }}
                <template v-if="updater.info?.assetSize"> · {{ formatBytes(updater.info.assetSize) }}</template>
              </template>
              <template v-else-if="updater.status === 'up-to-date'">
                You are running the latest version.
              </template>
              <template v-else>
                Official Linux .deb updates via GitHub Releases.
              </template>
            </p>
          </div>
        </div>

        <!-- Checking state -->
        <div
          v-if="updater.status === 'checking'"
          class="flex items-center justify-center gap-2.5 rounded-md border border-line-row bg-surface-block/60 py-8 text-[12.5px] text-ink-muted"
        >
          <UIcon name="i-ph-spinner-gap" class="size-4 animate-spin text-accent-400 [.light_&]:text-accent-600" />
          <span>Contacting GitHub Releases…</span>
        </div>

        <!-- Up-to-date state -->
        <div
          v-else-if="updater.status === 'up-to-date'"
          class="flex items-start gap-3 rounded-md border border-[#2A7B5B]/45 bg-[#2A7B5B]/14 p-3.5"
        >
          <UIcon name="i-ph-check-circle-fill" class="size-5 shrink-0 text-[#68D3A8] [.light_&]:text-[#1B6B4A] mt-0.5" />
          <div class="space-y-0.5">
            <p class="text-[13px] font-semibold text-[#68D3A8] [.light_&]:text-[#1B6B4A]">
              SchemaCrafter is up to date
            </p>
            <p class="text-[11.5px] text-ink-muted">
              Installed version <code class="font-mono text-ink-bright">v{{ updater.info?.currentVersion }}</code> matches the latest release (<code class="font-mono text-ink-bright">{{ updater.info?.tag }}</code>).
            </p>
          </div>
        </div>

        <!-- Installed & ready to restart -->
        <div
          v-else-if="updater.status === 'installed'"
          class="flex items-start gap-3 rounded-md border border-[#2A7B5B]/45 bg-[#2A7B5B]/14 p-3.5"
        >
          <UIcon name="i-ph-sparkle" class="size-5 shrink-0 text-[#68D3A8] [.light_&]:text-[#1B6B4A] mt-0.5" />
          <div class="space-y-1">
            <p class="text-[13px] font-semibold text-[#68D3A8] [.light_&]:text-[#1B6B4A]">
              Version {{ updater.info?.tag }} installed
            </p>
            <p class="text-[11.5px] text-ink-muted leading-relaxed">
              The new package was verified and installed cleanly. Restart SchemaCrafter to start using the updated version.
            </p>
          </div>
        </div>

        <!-- Active progress (downloading / verifying / installing) -->
        <div
          v-else-if="updater.status === 'downloading' || updater.status === 'verifying' || updater.status === 'installing'"
          class="space-y-2.5 rounded-md border border-line-panel bg-surface-block [.light_&]:bg-surface-raised p-3.5"
        >
          <div class="flex items-center justify-between gap-2 text-[11.5px]">
            <span class="flex items-center gap-2 text-ink-bright font-medium">
              <UIcon name="i-ph-spinner-gap" class="size-3.5 animate-spin text-accent-400 [.light_&]:text-accent-600" />
              {{ progressLabel }}
            </span>
            <span
              v-if="updater.status === 'downloading' && updater.progress.percent !== null"
              class="font-mono tabular-nums text-[11px] text-ink-dim"
            >
              {{ updater.progress.percent }}%
            </span>
          </div>

          <div class="h-2 w-full rounded-full bg-surface-root overflow-hidden border border-line-row">
            <div
              class="h-full bg-accent-500 transition-all duration-150"
              :class="updater.status !== 'downloading' ? 'animate-pulse w-full' : ''"
              :style="updater.status === 'downloading' ? { width: `${updater.progress.percent ?? 15}%` } : undefined"
            />
          </div>
        </div>

        <!-- Manual fallback state -->
        <div
          v-else-if="updater.status === 'manual' && updater.manualInfo"
          class="space-y-2.5 rounded-md border border-[#D99426]/45 bg-[#D99426]/12 p-3.5"
        >
          <p class="text-[12px] font-semibold text-[#F2C15A] [.light_&]:text-[#8A5406]">
            Package downloaded &amp; verified — finish in terminal
          </p>
          <p v-if="updater.manualInfo.message" class="text-[11.5px] text-ink-muted leading-snug">
            {{ updater.manualInfo.message }}
          </p>
          <div class="flex items-center gap-2 rounded border border-line-panel bg-surface-code px-2.5 py-2">
            <code class="flex-1 min-w-0 font-mono text-[11px] text-ink-bright truncate">
              {{ updater.manualInfo.installCommand }}
            </code>
            <UButton
              icon="i-ph-copy"
              label="Copy"
              color="neutral"
              variant="soft"
              size="xs"
              @click="copyManualCommand()"
            />
          </div>
        </div>

        <!-- Error banner -->
        <div
          v-else-if="updater.status === 'error' && updater.error"
          class="rounded-md border border-[#A63A50]/45 bg-[#A63A50]/14 p-3.5 space-y-1"
        >
          <p class="text-[12.5px] font-semibold text-[#F28B97] [.light_&]:text-[#A62C3E]">
            Could not complete update check
          </p>
          <p class="text-[11.5px] text-ink-muted break-words">
            {{ updater.error }}
          </p>
        </div>

        <!-- Available update details & release notes -->
        <template v-if="updater.updateAvailable && updater.info && updater.status !== 'installed'">
          <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono text-ink-dim">
            <span
              v-if="updater.info.assetName"
              class="inline-flex items-center gap-1 rounded border border-line-panel bg-surface-chrome px-2 py-0.5 text-ink"
            >
              <UIcon name="i-ph-package" class="size-3 text-accent-400 [.light_&]:text-accent-600" />
              {{ updater.info.assetName }}
            </span>
            <span
              v-if="updater.info.checksumUrl"
              class="inline-flex items-center gap-1 rounded border border-[#2A7B5B]/40 bg-[#2A7B5B]/12 px-2 py-0.5 text-[#68D3A8] [.light_&]:text-[#1B6B4A]"
            >
              <UIcon name="i-ph-shield-check" class="size-3" />
              SHA-256 verified
            </span>
          </div>

          <div v-if="updater.info.releaseNotes" class="space-y-1.5">
            <p class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
              Release notes
            </p>
            <pre class="max-h-48 overflow-y-auto scrollbar-thin rounded-md border border-line-panel bg-surface-code p-3 font-mono text-[11px] text-ink leading-relaxed whitespace-pre-wrap break-words">{{ updater.info.releaseNotes }}</pre>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-2 w-full">
        <UButton
          v-if="updater.info"
          label="View on GitHub"
          icon="i-ph-arrow-square-out"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="void updater.openReleasePage()"
        />
        <span v-else />

        <div class="flex items-center gap-2">
          <template v-if="updater.status === 'installed'">
            <UButton
              label="Later"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="updater.modalOpen = false"
            />
            <UButton
              v-if="desktopDoc?.isDirty"
              label="Save & Restart"
              icon="i-ph-floppy-disk"
              size="sm"
              @click="void onSaveAndRestart()"
            />
            <UButton
              v-else
              label="Restart now"
              icon="i-ph-arrow-clockwise"
              size="sm"
              @click="void onRestartNow()"
            />
          </template>

          <template v-else-if="updater.updateAvailable && updater.info?.canAutoInstall">
            <UButton
              label="Later"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="updater.isBusy"
              @click="updater.dismissCurrentUpdate()"
            />
            <UButton
              label="Download & Install"
              icon="i-ph-download-simple"
              size="sm"
              :loading="updater.isBusy"
              @click="void updater.installUpdate()"
            />
          </template>

          <template v-else-if="updater.updateAvailable">
            <UButton
              label="Later"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="updater.dismissCurrentUpdate()"
            />
            <UButton
              label="Download Release"
              icon="i-ph-arrow-square-out"
              size="sm"
              @click="void updater.openReleasePage()"
            />
          </template>

          <template v-else>
            <UButton
              label="Check again"
              icon="i-ph-arrows-clockwise"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="updater.status === 'checking'"
              @click="void updater.checkForUpdates()"
            />
            <UButton
              label="Close"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="updater.modalOpen = false"
            />
          </template>
        </div>
      </div>
    </template>
  </UModal>
</template>
