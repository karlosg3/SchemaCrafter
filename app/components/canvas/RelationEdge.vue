<script setup lang="ts">
import { BaseEdge, getBezierPath } from '@vue-flow/core'
import type { Position } from '@vue-flow/core'
import type { RelationKind } from '#shared/utils/graph'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  data?: {
    kind: RelationKind
    label: string
    width: number
    highlighted?: boolean
    dimmed?: boolean
  }
}>()

const STROKE: Record<RelationKind, string> = {
  fk: 'var(--color-rel-fk)',
  enum: 'var(--color-rel-enum)',
  cross: 'var(--color-rel-cross)',
  aggregate: 'var(--color-rel-aggregate)'
}

const path = computed(() => getBezierPath({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  sourcePosition: props.sourcePosition,
  targetX: props.targetX,
  targetY: props.targetY,
  targetPosition: props.targetPosition
}))

const d = computed(() => path.value[0])
const labelX = computed(() => path.value[1])
const labelY = computed(() => path.value[2])

const style = computed(() => {
  const baseWidth = props.data?.width ?? 1.75
  const highlighted = props.data?.highlighted
  const dimmed = props.data?.dimmed
  return {
    stroke: highlighted && props.data?.kind === 'fk'
      ? 'var(--color-rel-active)'
      : STROKE[props.data?.kind ?? 'fk'],
    strokeWidth: highlighted ? baseWidth + 1 : baseWidth,
    opacity: dimmed ? 0.22 : 1,
    cursor: props.data?.kind === 'fk' ? 'pointer' : undefined,
    transition: 'opacity 140ms ease, stroke-width 140ms ease, stroke 140ms ease'
  }
})
</script>

<template>
  <BaseEdge :id="id" :path="d" :style="style" />

  <text
    v-if="data?.label"
    :x="labelX"
    :y="labelY"
    class="font-mono text-[10px] pointer-events-none select-none transition-opacity"
    :class="[
      data.highlighted ? 'fill-ink-bright font-semibold' : 'fill-ink-muted',
      data.dimmed ? 'opacity-25' : 'opacity-100'
    ]"
    text-anchor="middle"
    dominant-baseline="middle"
    style="paint-order: stroke; stroke: var(--color-surface-canvas); stroke-width: 6px; stroke-linejoin: round"
  >{{ data.label }}</text>
</template>
