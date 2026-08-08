<script setup lang="ts">
/**
 * Slide 7 — what is live against what is next.
 *
 * Wording is bounded by the trust-boundary list in the repo CLAUDE.md. Do not
 * promote anything from the right column to the left without checking the code
 * first; "the public verifier reads Supabase, not the chain" is the specific
 * claim a judge is most likely to test.
 */

const LIVE = [
  'Compact registry contract on Midnight: attest, registerPolicy, proveCompliance',
  'Four npm reference policies registered at deploy',
  'Local runtime — sponsor wallet, Docker proof server, indexer verification',
  'Hosted app: GitHub OAuth, workflow dispatch, artifact retrieval, pairing',
]

const NEXT = [
  'Chain-backed public verifier — today’s dashboard reads a Supabase read-model',
  'Signed evidence: Sigstore or SLSA provenance instead of trusting the workflow',
  'Buyer-authored policies instead of four fixed reference policies',
]
</script>

<template>
  <div>
    <div class="grid grid-cols-2 gap-4">
      <div class="zk-card p-5">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-success" />
          <span class="zk-eyebrow">Live today</span>
        </div>
        <div class="mt-2">
          <div v-for="item in LIVE" :key="item" class="zk-row">
            <span class="text-[13px] leading-[1.45] text-foreground">{{ item }}</span>
          </div>
        </div>
      </div>

      <div class="zk-card p-5">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-muted" />
          <span class="zk-eyebrow">Next</span>
        </div>
        <div class="mt-2">
          <div v-for="item in NEXT" :key="item" class="zk-row">
            <span class="zk-body-md">{{ item }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="zk-body-md mt-4">
      <span class="font-medium text-foreground">The honest boundary:</span>
      GitHub Actions is our trusted measurement environment. zkuat proves that the accepted evidence
      satisfies the policy — not that the scanner was honest. Closing that is a signature, not a new
      protocol.
    </div>
  </div>
</template>
