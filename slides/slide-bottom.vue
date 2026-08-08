<template>
  <!--
    Per-slide footer, not `global-bottom.vue`. The Slidev export docs list
    "wrong global layer state" as a known export failure and name the `slide-*`
    layers as the fix, so the watermark lives here.

    Suppressed on the cover and the closing slide — both carry their own
    wordmark, and the closing slide's own footer line lands exactly here.
  -->
  <div
    v-if="$slidev?.nav && $slidev.nav.currentPage > 1 && $slidev.nav.currentPage < $slidev.nav.total"
    class="absolute inset-x-0 bottom-0 flex items-center justify-between px-14 pb-5 text-[11px] text-muted"
  >
    <span>zkuat</span>
    <span class="font-mono tabular-nums">{{ $slidev.nav.currentPage }}</span>
  </div>
</template>
