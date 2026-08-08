<script setup lang="ts">
/**
 * The rounded-full micro-badge from design-system.md §6.
 *
 * State badges tint text only on a `bg-card` fill — no saturated fills, per the
 * design system. `dot` renders the 6px status dot, which the system prefers
 * over a badge whenever the label already sits in a row.
 */
withDefaults(
  defineProps<{
    tone?: 'muted' | 'accent' | 'success' | 'warning' | 'danger'
    dot?: boolean
  }>(),
  { tone: 'muted', dot: false },
)

const TONE = {
  muted: 'text-muted',
  accent: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const

const DOT = {
  muted: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 py-1 text-[12px] font-medium leading-none"
    :class="TONE[tone]"
  >
    <span v-if="dot" class="w-1.5 h-1.5 flex-shrink-0 rounded-full" :class="DOT[tone]" />
    <slot />
  </span>
</template>
