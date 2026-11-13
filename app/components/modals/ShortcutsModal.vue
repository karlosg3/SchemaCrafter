<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const isDesktop = isDesktopApp()

const SECTIONS = computed(() => {
  const sections = [
    {
      title: 'Workspace & Navigation',
      items: [
        { keys: ['Ctrl', 'K'], label: 'Open Command Palette (jump, export, switch)' },
        { keys: ['Ctrl', 'Z'], label: 'Undo workspace mutation' },
        { keys: ['Ctrl', 'Shift', 'Z'], label: 'Redo workspace mutation' }
      ]
    },
    {
      title: 'Canvas',
      items: [
        { keys: ['Ctrl', '0'], label: 'Reset zoom & fit view' },
        { keys: ['Delete'], label: 'Remove selected block' },
        { keys: ['Double-click'], label: 'Drill into database or schema' }
      ]
    },
    {
      title: 'Code Editor',
      items: [
        { keys: ['Ctrl', 'F'], label: 'Find & replace in code' },
        { keys: ['Ctrl', 'Enter'], label: 'Apply code changes to canvas' }
      ]
    }
  ]

  if (isDesktop) {
    sections.unshift({
      title: 'Desktop File',
      items: [
        { keys: ['Ctrl', 'N'], label: 'New project' },
        { keys: ['Ctrl', 'O'], label: 'Open project (.schemacrafter / .json)' },
        { keys: ['Ctrl', 'S'], label: 'Save project' },
        { keys: ['Ctrl', 'Shift', 'S'], label: 'Save project as…' }
      ]
    })
  }

  return sections
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Keyboard Shortcuts"
    description="Quick reference for canvas navigation, code editing, and desktop files."
    :ui="{ content: 'max-w-md border border-line-chrome bg-surface-chrome' }"
  >
    <template #body>
      <div class="space-y-5">
        <section v-for="section in SECTIONS" :key="section.title" class="space-y-2">
          <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
            {{ section.title }}
          </h3>
          <div class="space-y-1.5">
            <div
              v-for="item in section.items"
              :key="item.label"
              class="flex items-center justify-between gap-3 rounded-md border border-line-row bg-surface-raised/50 px-2.5 py-1.5"
            >
              <span class="text-[12px] text-ink">{{ item.label }}</span>
              <span class="flex items-center gap-1 shrink-0">
                <kbd
                  v-for="key in item.keys"
                  :key="key"
                  class="rounded border border-line-panel bg-surface-chrome px-1.5 py-0.5 font-mono text-[10.5px] text-ink-bright"
                >
                  {{ key }}
                </kbd>
              </span>
            </div>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end w-full">
        <UButton label="Close" color="neutral" variant="ghost" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
