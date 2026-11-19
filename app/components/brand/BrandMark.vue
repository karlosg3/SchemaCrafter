<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Forces a specific variant; defaults to automatic theme-aware switching (blue in dark, terracotta in light). */
  variant?: 'auto' | 'blue' | 'terracotta'
  sizeClass?: string
}>(), {
  variant: 'auto',
  sizeClass: 'size-7'
})

const colorMode = useColorMode()
const uid = useId()

const isTerracotta = computed(() => {
  if (props.variant === 'terracotta') return true
  if (props.variant === 'blue') return false
  return colorMode.value === 'light'
})

const palette = computed(() =>
  isTerracotta.value
    ? {
        bgTop: '#E8633B',
        bgMid: '#D64A25',
        bgBot: '#B9391A',
        grid: '#fff4ee',
        tileTop: '#FFFBF5',
        tileBot: '#F3EADF',
        hingeTop: '#234873',
        hingeBot: '#132A47'
      }
    : {
        bgTop: '#265385',
        bgMid: '#193A62',
        bgBot: '#102644',
        grid: '#e8f4ff',
        tileTop: '#FCF9F2',
        tileBot: '#EFE8DA',
        hingeTop: '#F57B47',
        hingeBot: '#DA5524'
      }
)
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 1024 1024"
    :class="[sizeClass, 'shrink-0 select-none']"
    aria-hidden="true"
  >
    <defs>
      <clipPath :id="`${uid}-clip`">
        <rect x="24" y="24" width="976" height="976" rx="220" ry="220" />
      </clipPath>
      <linearGradient :id="`${uid}-bg`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="palette.bgTop" />
        <stop offset="52%" :stop-color="palette.bgMid" />
        <stop offset="100%" :stop-color="palette.bgBot" />
      </linearGradient>
      <linearGradient :id="`${uid}-tile`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="palette.tileTop" />
        <stop offset="100%" :stop-color="palette.tileBot" />
      </linearGradient>
      <linearGradient :id="`${uid}-hinge`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" :stop-color="palette.hingeTop" />
        <stop offset="100%" :stop-color="palette.hingeBot" />
      </linearGradient>
      <mask :id="`${uid}-ul`">
        <rect x="0" y="0" width="1024" height="1024" fill="#fff" />
        <path d="M 417.07,489.27 A 14.00,14.00 0 0 1 424.99,495.70 L 528.30,599.01 A 14.00,14.00 0 0 1 534.73,606.93 A 84.00,84.00 0 1 0 606.93,534.73 A 14.00,14.00 0 0 1 599.01,528.30 L 495.70,424.99 A 14.00,14.00 0 0 1 489.27,417.07 A 84.00,84.00 0 1 0 417.07,489.27 Z" fill="#000" />
        <rect x="492" y="406" width="100" height="180" fill="#000" />
      </mask>
      <mask :id="`${uid}-lr`">
        <rect x="0" y="0" width="1024" height="1024" fill="#fff" />
        <path d="M 417.07,489.27 A 14.00,14.00 0 0 1 424.99,495.70 L 528.30,599.01 A 14.00,14.00 0 0 1 534.73,606.93 A 84.00,84.00 0 1 0 606.93,534.73 A 14.00,14.00 0 0 1 599.01,528.30 L 495.70,424.99 A 14.00,14.00 0 0 1 489.27,417.07 A 84.00,84.00 0 1 0 417.07,489.27 Z" fill="#000" />
        <rect x="432" y="438" width="100" height="180" fill="#000" />
      </mask>
    </defs>

    <g :clip-path="`url(#${uid}-clip)`">
      <rect x="0" y="0" width="1024" height="1024" :fill="`url(#${uid}-bg)`" />

      <!-- Blueprint keylines (simplified cleanly for small navbar & card sizes) -->
      <g :stroke="palette.grid" stroke-opacity="0.28" fill="none">
        <line x1="268" y1="0" x2="268" y2="1024" stroke-width="6" />
        <line x1="512" y1="0" x2="512" y2="1024" stroke-width="8" />
        <line x1="756" y1="0" x2="756" y2="1024" stroke-width="6" />
        <line x1="0" y1="268" x2="1024" y2="268" stroke-width="6" />
        <line x1="0" y1="512" x2="1024" y2="512" stroke-width="8" />
        <line x1="0" y1="756" x2="1024" y2="756" stroke-width="6" />
        <line x1="24" y1="24" x2="1000" y2="1000" stroke-width="6" />
        <line x1="1000" y1="24" x2="24" y2="1000" stroke-width="6" />
        <circle cx="512" cy="512" r="356" stroke-width="8" />
        <circle cx="512" cy="512" r="236" stroke-width="6" />
      </g>

      <!-- Emblem tiles & straight-shaft connector -->
      <path
        d="M 258.00,204.00 L 530.00,204.00 A 26.00,26.00 0 0 1 556.00,230.00 L 556.00,546.00 A 10.00,10.00 0 0 1 546.00,556.00 L 230.00,556.00 A 26.00,26.00 0 0 1 204.00,530.00 L 204.00,258.00 A 54.00,54.00 0 0 1 258.00,204.00 Z"
        :fill="`url(#${uid}-tile)`"
        :mask="`url(#${uid}-ul)`"
      />
      <path
        d="M 478.00,468.00 L 794.00,468.00 A 26.00,26.00 0 0 1 820.00,494.00 L 820.00,766.00 A 54.00,54.00 0 0 1 766.00,820.00 L 494.00,820.00 A 26.00,26.00 0 0 1 468.00,794.00 L 468.00,478.00 A 10.00,10.00 0 0 1 478.00,468.00 Z"
        :fill="`url(#${uid}-tile)`"
        :mask="`url(#${uid}-lr)`"
      />
      <path
        d="M 416.82,462.98 A 22.00,22.00 0 0 1 435.31,469.25 L 554.75,588.69 A 22.00,22.00 0 0 1 561.02,607.18 A 58.00,58.00 0 1 0 607.18,561.02 A 22.00,22.00 0 0 1 588.69,554.75 L 469.25,435.31 A 22.00,22.00 0 0 1 462.98,416.82 A 58.00,58.00 0 1 0 416.82,462.98 Z"
        :fill="`url(#${uid}-hinge)`"
      />

      <rect
        x="28"
        y="28"
        width="968"
        height="968"
        rx="216"
        ry="216"
        fill="none"
        stroke="#ffffff"
        stroke-opacity="0.26"
        stroke-width="14"
      />
    </g>
  </svg>
</template>
