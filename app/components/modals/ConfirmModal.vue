<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  message: string
  confirmLabel?: string
  /** Destructive by default — every caller so far is a delete. */
  color?: 'error' | 'primary'
}>(), {
  title: 'Are you sure?',
  confirmLabel: 'Delete',
  color: 'error'
})

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [confirmed: boolean], 'after:leave': [] }>()

const close = (confirmed: boolean) => emit('close', confirmed)
useModalDismiss(open, close, false)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :ui="{ content: 'max-w-sm border border-line-chrome bg-surface-chrome' }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <div class="flex items-start gap-3">
        <span
          class="size-8 shrink-0 rounded-lg grid place-items-center border"
          :class="color === 'error'
            ? 'bg-red-500/10 border-red-500/25 text-red-400'
            : 'bg-accent-500/10 border-accent-500/25 text-accent-400'"
        >
          <UIcon :name="color === 'error' ? 'i-ph-warning' : 'i-ph-info'" class="size-4" />
        </span>
        <p class="text-[12.5px] text-ink leading-relaxed pt-0.5">
          {{ message }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(false)" />
        <UButton :label="confirmLabel" :color="color" autofocus @click="close(true)" />
      </div>
    </template>
  </UModal>
</template>
