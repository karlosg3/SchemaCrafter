<script setup lang="ts">
withDefaults(defineProps<{
  addLabel: string
  /** False when there is nothing to add into — no active database, say. */
  canAdd?: boolean
  emptyMessage: string
  isEmpty: boolean
}>(), {
  canAdd: true
})

const emit = defineEmits<{ add: [] }>()
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 space-y-0.5">
      <div
        v-if="isEmpty"
        class="mx-1 my-4 rounded-lg border border-dashed border-line-panel bg-surface-raised/40 px-3 py-6 text-center"
      >
        <UIcon name="i-ph-tray" class="mx-auto mb-1.5 size-5 text-ink-faint" />
        <p class="text-[11.5px] text-ink-faint">
          {{ emptyMessage }}
        </p>
      </div>
      <slot />
    </div>

    <div class="p-2 border-t border-line-chrome">
      <button
        type="button"
        class="w-full h-8 rounded-md border border-dashed border-line-dashed text-[11.5px] font-medium
               text-accent-400 hover:bg-accent-500/8 transition-colors
               disabled:opacity-40 disabled:hover:bg-transparent
               focus-visible:outline-2 focus-visible:outline-accent-500"
        :disabled="!canAdd"
        @click="emit('add')"
      >
        + {{ addLabel }}
      </button>
    </div>
  </div>
</template>
