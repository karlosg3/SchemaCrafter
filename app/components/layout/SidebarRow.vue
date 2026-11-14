<script setup lang="ts">
import type { Gradient } from '#shared/types/workspace'

withDefaults(defineProps<{
  label: string
  gradient?: Gradient
  count?: number | string
  active?: boolean
  deletable?: boolean
  /** Why deletion is unavailable, surfaced as a tooltip. */
  deleteHint?: string
}>(), {
  deletable: true,
  gradient: undefined,
  count: undefined,
  deleteHint: undefined
})

const emit = defineEmits<{
  select: []
  edit: []
  remove: []
}>()
</script>

<template>
  <div
    data-sidebar-row
    class="group flex items-center gap-1 pr-1 rounded-md border transition-colors
           hover:bg-accent-500/6 focus-within:bg-accent-500/6"
    :class="active
      ? 'bg-accent-500/10 border-accent-500/30'
      : 'border-transparent'"
  >
    <button
      type="button"
      class="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left rounded-md
             focus-visible:outline-2 focus-visible:outline-accent-500"
      :aria-current="active ? 'true' : undefined"
      @click="emit('select')"
    >
      <span
        v-if="gradient"
        class="size-2.5 rounded-xs shrink-0 shadow-xs"
        :style="{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }"
      />

      <span class="flex-1 truncate text-[12.5px] font-medium text-ink" :class="active ? 'text-ink-bright' : ''">
        {{ label }}
      </span>

      <span
        v-if="count !== undefined"
        class="rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0 bg-surface-raised/80 text-ink-dim border border-line-row"
      >
        {{ count }}
      </span>
    </button>

    <span class="flex items-center gap-0.5 shrink-0 invisible group-hover:visible group-focus-within:visible">
      <UButton
        icon="i-ph-pencil-simple"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="`Edit ${label}`"
        @click="emit('edit')"
      />
      <UTooltip :text="deleteHint" :disabled="!deleteHint || deletable">
        <UButton
          icon="i-ph-trash"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Delete ${label}`"
          :disabled="!deletable"
          class="hover:text-red-400"
          @click="emit('remove')"
        />
      </UTooltip>
    </span>
  </div>
</template>
