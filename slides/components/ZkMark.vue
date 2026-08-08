<!--
  The zkuat mark. A check assembled from six discrete blocks rather than drawn
  as one stroke: the verdict is not a gesture, it is what a sequence of
  committed steps adds up to. The gradient runs along the mark's own axis, so
  the sequence reads left to right — evidence into verdict.

  Kept byte-identical to ui/src/app/icon.svg and slides/public/icon.svg.

  The gradient id is fixed rather than generated: every instance paints the
  identical gradient, so a duplicate id across slides resolves to the same
  paint and there is nothing to collide over.
-->
<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 32 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    role="img"
    aria-label="zkuat"
    class="shrink-0"
  >
    <defs>
      <linearGradient id="zkuat-mark" x1="5" y1="23" x2="27" y2="8" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#00dfe1" />
        <stop offset="1" stop-color="#a672ff" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="10" fill="#0b0b0b" />
    <g fill="url(#zkuat-mark)">
      <rect x="4.3" y="11.9" width="5" height="5" rx="1.6" />
      <rect x="7.9" y="15.5" width="5" height="5" rx="1.6" />
      <rect x="11.5" y="19.1" width="5" height="5" rx="1.6" />
      <rect x="15.3" y="15.3" width="5" height="5" rx="1.6" />
      <rect x="19.1" y="11.5" width="5" height="5" rx="1.6" />
      <rect x="22.9" y="7.7" width="5" height="5" rx="1.6" />
    </g>
  </svg>
</template>
