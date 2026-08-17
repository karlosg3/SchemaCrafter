<script setup lang="ts">
import type { Gradient } from '#shared/types/workspace'

defineProps<{
  label: string
  gradient?: Gradient
  count?: number | string
  active?: boolean
  deletable?: boolean
  /** Why deletion is unavailable, surfaced as a tooltip. */
  deleteHint?: string
}>()

const emit = defineEmits<{
  select: []
  edit: []
  remove: []
}>()
</script>

<template>
  <!--
    The row body is a real <button>, not a div with a click handler — the React
    sidebar used role-less divs, which audit UI-3 flagged as keyboard-
    inaccessible. The edit/delete tools sit *beside* it rather than inside it:
    a button may not contain interactive content, and browsers silently hoist
    nested buttons out of their parent, which breaks the row layout.
  -->
  <div
    data-sidebar-row
    class="group flex items-center gap-1 pr-1 border-2 border-transparent transition-colors
           hover:bg-white/5 focus-within:bg-white/5"
    :class="active ? 'bg-white/5 border-line-panel' : ''"
  >
    <button
      type="button"
      class="flex-1 min-w-0 flex items-center gap-2 px-2 py-[7px] text-left
             focus-visible:outline-2 focus-visible:outline-accent-500"
      :aria-current="active ? 'true' : undefined"
      @click="emit('select')"
    >
      <span
        v-if="gradient"
        class="size-2 shrink-0"
        :style="{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }"
      />

      <span class="flex-1 truncate text-[12.5px] text-ink">{{ label }}</span>

      <span v-if="count !== undefined" class="text-[10.5px] text-ink-dim font-mono shrink-0">
        {{ count }}
      </span>
    </button>

    <!--
      invisible/group-hover:visible rather than opacity-0: an opacity-0 control
      still swallows clicks, which audit UI-1 flagged in seven places.
    -->
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
          :disabled="deletable === false"
          class="hover:text-red-400"
          @click="emit('remove')"
        />
      </UTooltip>
    </span>
  </div>
</template>
