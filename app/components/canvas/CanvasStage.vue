<script setup lang="ts">
import type { BlockKind } from '#shared/utils/graph'

const toast = useToast()

/**
 * Host for the flow canvas. Entity forms are the modals' job (P5); until they
 * exist the intent is acknowledged rather than swallowed, so the pencil is not
 * a dead click target.
 */
function onEdit(payload: { kind: BlockKind, id: string }) {
  toast.add({
    title: `Edit ${payload.kind}`,
    description: 'The entity forms arrive with the modals.',
    color: 'neutral'
  })
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-surface-canvas">
    <SchemaCanvas @edit="onEdit" />
  </div>
</template>
