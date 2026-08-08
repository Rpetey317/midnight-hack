<script setup lang="ts">
/**
 * Slide 3 — a port of `ui/src/components/app/asymmetry.tsx` at slide scale.
 *
 * The numbers are the npm CI Baseline case: 11 known vulnerabilities, 3 of them
 * high, zero critical. That *satisfies* the policy (`maxCriticals 0`,
 * `maxHighs 5`, total unconstrained) — which is the point. The buyer gets a
 * green verdict and still learns none of the counts.
 *
 * `revealed` is driven from `$clicks` in the slide so the public pane arrives
 * second. With `--with-clicks` (the pptx default) each state becomes its own
 * Google Slides page, so the reveal survives the export.
 *
 * Icons are inline SVG at stroke-width 1.5 rather than an icon font: the export
 * rasterises every slide, and an unresolved icon is a silent blank square.
 */
withDefaults(defineProps<{ revealed?: boolean }>(), { revealed: true })

const PRIVATE_ROWS = [
  { label: 'Critical vulnerabilities', value: '0' },
  { label: 'High vulnerabilities', value: '3' },
  { label: 'Total vulnerabilities', value: '11' },
  { label: 'Lint / build', value: 'pass / pass' },
  { label: 'Commit', value: '9f2a71c' },
]

// `policyRequirements()` for npm-ci-baseline-v1, verbatim.
const PUBLIC_ROWS = [
  'No critical vulnerabilities',
  'At most 5 high vulnerabilities',
  'Lint check passed',
  'Build check passed',
  'Evidence validity no longer than 30 days',
]
</script>

<template>
  <div class="grid grid-cols-[1fr_92px_1fr] items-stretch">
    <!-- Private -->
    <div class="zk-card p-5">
      <div class="flex items-center gap-2">
        <svg
          class="w-4 h-4 flex-shrink-0 text-warning" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span class="zk-h3">What the local runtime holds</span>
      </div>
      <div class="zk-meta mt-1">acme/payments-sdk</div>

      <div class="mt-3">
        <div v-for="row in PRIVATE_ROWS" :key="row.label" class="zk-row justify-between">
          <span class="zk-body-md">{{ row.label }}</span>
          <span class="font-mono text-[13px] tabular-nums text-foreground">{{ row.value }}</span>
        </div>
      </div>

      <div class="mt-4 text-[12px] font-medium text-warning">
        Private — never written to Midnight
      </div>
    </div>

    <!-- The membrane. Two complete cards with the proof between them reads as
         "two views" far more clearly than one panel split down the middle. -->
    <div
      class="relative flex items-center justify-center transition-opacity duration-300"
      :class="revealed ? 'opacity-100' : 'opacity-0'"
    >
      <div class="absolute inset-x-0 top-1/2 h-px bg-hairline" />
      <div
        class="relative z-10 flex items-center gap-1.5 rounded-full border border-hairline bg-background px-2.5 py-1.5"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-accent" />
        <span class="text-[10px] font-medium uppercase tracking-[0.09em] text-muted">ZK</span>
      </div>
    </div>

    <!-- Public -->
    <div
      class="zk-card p-5 transition-opacity duration-300"
      :class="revealed ? 'opacity-100' : 'opacity-0'"
    >
      <div class="flex items-center gap-2">
        <span class="grid w-4 h-4 flex-shrink-0 place-items-center rounded-full bg-success/10 text-success">
          <svg
            class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <span class="zk-h3">What the verifier sees</span>
      </div>
      <div class="zk-meta mt-1">npm CI Baseline v1 · satisfied</div>

      <div class="mt-3">
        <div v-for="row in PUBLIC_ROWS" :key="row" class="zk-row">
          <span class="grid w-4 h-4 flex-shrink-0 place-items-center rounded-full bg-success/10 text-success">
            <svg
              class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span class="text-[13px] leading-[1.4] text-foreground">{{ row }}</span>
        </div>
      </div>

      <div class="zk-meta mt-4">artifact 3d8f21a90b…03b41e · valid to 04 Sep 2026</div>
    </div>
  </div>
</template>
