<script setup lang="ts">
import { BaseEdge, getBezierPath } from '@vue-flow/core'
import type { Position } from '@vue-flow/core'
import type { RelationKind } from '#shared/utils/graph'

// Vue Flow hands an edge component its whole descriptor; this one renders a
// fragment, so the unused half would land as extraneous attrs on the <text>.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  data?: { kind: RelationKind, label: string, width: number }
}>()

/** Stroke colours from DB Canvas Designer.dc.html, as tokens in main.css. */
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

const style = computed(() => ({
  stroke: STROKE[props.data?.kind ?? 'fk'],
  strokeWidth: props.data?.width ?? 2
}))
</script>

<template>
  <BaseEdge :id="id" :path="d" :style="style" />

  <!--
    paint-order:stroke draws the canvas-coloured halo behind the glyphs, which
    is how the prototype keeps labels legible where they cross an edge.
  -->
  <text
    v-if="data?.label"
    :x="labelX"
    :y="labelY"
    class="fill-ink-muted font-mono text-[10px] pointer-events-none select-none"
    text-anchor="middle"
    dominant-baseline="middle"
    style="paint-order: stroke; stroke: var(--color-surface-canvas); stroke-width: 5px"
  >{{ data.label }}</text>
</template>
