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

/**
 * Resolves the promise `useOverlay().open()` returns. The React app carried an
 * `onConfirm` closure around in app state to do the same thing (App.tsx:106).
 */
const emit = defineEmits<{ close: [confirmed: boolean], 'after:leave': [] }>()

const close = (confirmed: boolean) => emit('close', confirmed)
useModalDismiss(open, close, false)
</script>

<template>
  <UModal v-model:open="open" :title="title" @after:leave="emit('after:leave')">
    <template #body>
      <p class="text-[12.5px] text-ink leading-relaxed">
        {{ message }}
      </p>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="close(false)" />
        <UButton :label="confirmLabel" :color="color" autofocus @click="close(true)" />
      </div>
    </template>
  </UModal>
</template>
