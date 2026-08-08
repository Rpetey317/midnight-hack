<script setup lang="ts">
/**
 * Slide 4 — the four steps, copy lifted from `STEPS` in `ui/src/app/page.tsx`,
 * with a `where` tag added because on a pitch slide "where does this run" is
 * the question the whole architecture hangs on.
 *
 * Rendered as a gapless 4-up grid over a hairline background — the same
 * `gap-px on bg-border` trick the landing page uses for its step list.
 */

const STEPS = [
  {
    n: '01',
    where: 'GitHub Actions',
    title: 'Your CI measures',
    body: 'The repository’s own workflow runs the checks and writes a small evidence artifact for the requested commit.',
  },
  {
    n: '02',
    where: 'Your machine',
    title: 'The runtime commits',
    body: 'A local companion validates the run and artifact, adds a private salt, and derives the exact Compact commitment.',
  },
  {
    n: '03',
    where: 'Midnight',
    title: 'The commitment is anchored',
    body: 'Only the commitment enters Midnight, inserted into a historic Merkle tree. The evidence is nowhere on chain.',
  },
  {
    n: '04',
    where: 'Your machine → Midnight',
    title: 'You prove, locally',
    body: 'A proof generated on your machine shows the anchored evidence satisfies a published policy. One boolean is disclosed.',
  },
]
</script>

<template>
  <div>
    <div class="grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline">
      <div v-for="step in STEPS" :key="step.n" class="flex flex-col bg-card p-4">
        <div class="flex items-baseline gap-2">
          <span class="font-mono text-[12px] tabular-nums text-muted">{{ step.n }}</span>
          <span class="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
            {{ step.where }}
          </span>
        </div>
        <div class="zk-h3 mt-3">{{ step.title }}</div>
        <div class="zk-body mt-2">{{ step.body }}</div>
      </div>
    </div>

    <div class="mt-4 flex items-center gap-3 rounded-xl border border-hairline px-4 py-3">
      <span class="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-accent" />
      <span class="zk-body-md">
        Two transactions per job —
        <span class="font-mono text-[12.5px] text-foreground">attest</span> and
        <span class="font-mono text-[12.5px] text-foreground">proveCompliance</span>.
        The final verification is an indexer read, not a third transaction.
      </span>
    </div>
  </div>
</template>
