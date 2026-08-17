<script setup lang="ts">
/**
 * Shared chrome for the four rail panels: a scrolling list over a pinned dashed
 * add button. Only the rows and what "add" means differ between them.
 */
withDefaults(defineProps<{
  addLabel: string
  /** False when there is nothing to add into — no active database, say. */
  canAdd?: boolean
  emptyMessage: string
  isEmpty: boolean
}>(), {
  // Vue casts an omitted Boolean prop to `false`, not `undefined`, so this
  // needs an explicit default or every panel's add button starts disabled.
  canAdd: true
})

const emit = defineEmits<{ add: [] }>()
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 space-y-px">
      <p v-if="isEmpty" class="px-2 py-6 text-center text-[11.5px] text-ink-faint">
        {{ emptyMessage }}
      </p>
      <slot />
    </div>

    <div class="p-2 border-t-2 border-line-chrome">
      <button
        type="button"
        class="w-full h-8 border-2 border-dashed border-line-dashed text-[11.5px]
               text-accent-400 hover:bg-white/5 transition-colors
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
