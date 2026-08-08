---
theme: default
title: zkuat — prove your security posture, disclose nothing
author: zkuat
colorSchema: light
aspectRatio: 16/9
canvasWidth: 980
fonts:
  sans: Geist
  mono: Geist Mono
  provider: google
  weights: '400,500,600'
exportFilename: zkuat-pitch
drawings:
  enabled: false
wakeLock: false
transition: none
---

<!--
  Headings and body text are <div>/<span> with the type shortcuts from
  uno.config.ts, never <h1>/<p>. theme-default styles those elements at a
  specificity that silently swallows every utility class. See styles/index.css.

  Content box is 868 x 459 at this canvas size; `min-h-[459px]` is that height.
-->

<div class="flex min-h-[459px] flex-col justify-between">

<!-- <div class="flex items-center gap-2.5">
  <span class="zk-mark">zk</span>
  <span class="text-[17px] font-semibold tracking-tight">zkuat</span>
</div> -->

<div>
  <Pill dot tone="accent">Zero-knowledge attestation on Midnight</Pill>
  <div class="zk-h1-xl mt-5">Prove your security posture.<br />Disclose nothing.</div>
  <div class="zk-lead mt-5 max-w-[540px]">
    Prove a codebase satisfies a buyer's security policy — without revealing the code,
    the findings, or the dependency list.
  </div>
</div>

<div class="zk-meta">Hack Buenos Aires 2026 · zkuat.works</div>

</div>

<!--
[0:00 – 0:10]

"Every vendor security review asks you to prove your code is healthy. zkuat lets you prove
it without handing anything over."

Do not read the slide. Say the line and move.
-->

---

<div class="flex min-h-[459px] flex-col">

<div>
<div class="zk-eyebrow">The problem</div>
<div class="zk-h1 mt-2">The evidence is the exposure.</div>
</div>

<div class="mt-9 grid grid-cols-[1fr_320px] items-start gap-10">

<div>
  <div class="zk-lead">
    To prove your codebase is healthy, you hand over your source, your CI logs, and your
    vulnerability findings. Fifty enterprise customers means fifty questionnaires, fifty NDAs, and
    <span class="text-foreground">fifty copies of a map to your weak points</span>
    sitting in someone else's shared drive.
  </div>

  <div class="mt-8 text-[22px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground">
    The verifier never needed any of it.<br />They needed a boolean.
  </div>
</div>

<div class="zk-card p-5">
  <div class="zk-eyebrow">What the review asks for</div>
  <div class="mt-2">
    <div class="zk-row"><span class="zk-body-md">Source access</span></div>
    <div class="zk-row"><span class="zk-body-md">CI and build logs</span></div>
    <div class="zk-row"><span class="zk-body-md">Full dependency tree</span></div>
    <div class="zk-row"><span class="zk-body-md">Vulnerability findings, by severity</span></div>
    <div class="zk-row"><span class="zk-body-md">A signed NDA, per customer</span></div>
  </div>
</div>

</div>

</div>

<!--
[0:10 – 0:30]  ~20s

Land three beats, then stop:

  1. To prove the code is healthy you hand over the findings.
  2. That does not scale — fifty customers, fifty NDAs, fifty copies of your attack surface.
  3. And none of it was the thing they actually wanted.

The last line is the pivot into the next slide. Say it slowly:
"they never needed the evidence — they needed a boolean."
-->

---
clicks: 1
---

<div class="flex min-h-[459px] flex-col">

<div>
<div class="zk-eyebrow">The asymmetry</div>
<div class="zk-h1 mt-2">One artifact. Two irreconcilable views.</div>
</div>

<div class="flex flex-1 flex-col justify-center">
  <Asymmetry :revealed="$clicks > 0" />
  <div class="zk-body-md mt-4 transition-opacity duration-300" :class="$clicks > 0 ? 'opacity-100' : 'opacity-0'">
    Every number on the left is absent from the right — and absent from the chain.
  </div>
</div>

</div>

<!--
[0:30 – 1:00]  ~30s

CLICK 1 shows the private side only. Say:
"This is what your CI actually measured. Eleven known vulnerabilities. Three of them high."

CLICK 2 reveals the proof and the public side. Say:
"And this is everything the buyer receives. Policy satisfied. Artifact identity. An expiry
date. They can check every requirement on the policy they published — and they still do not
know whether you had eleven vulnerabilities or zero."

This is the slide the pitch rests on. If you are running behind, take the time here and cut
slide 7 instead.
-->

---

<div class="flex min-h-[459px] flex-col">

<div>
<div class="zk-eyebrow">How it works</div>
<div class="zk-h1 mt-2">Four steps, with findings kept off chain.</div>
</div>

<div class="flex flex-1 flex-col justify-center">
  <FlowSteps />
</div>

</div>

<!--
[1:00 – 1:25]  ~25s

Trace the row left to right, one clause each:

  "Your own CI workflow measures the build and writes a small evidence file.
   A companion process on your machine salts it and commits to it.
   Only the commitment goes on chain, into a historic Merkle tree.
   Then you prove — locally — that the committed evidence satisfies a published policy."

Then the strip: "Two transactions. The verification at the end is just a read."

No browser wallet anywhere — mention only if a judge asks.
-->

---

<div class="flex min-h-[459px] flex-col">

<div>
<div class="zk-eyebrow">Why this needs Midnight</div>
<div class="zk-h1 mt-2">Remove the zero-knowledge layer and you are back to emailing a PDF.</div>
</div>

<div class="grid flex-1 grid-cols-[1.08fr_0.92fr] content-center items-center gap-8">

<div>
  <DiscloseSnippet />
  <div class="zk-body-md mt-3">
    <span class="font-medium text-foreground">disclose() wraps the conjunction, never the operands.</span>
    Disclosing them separately would leak which control failed.
  </div>
  <div class="zk-meta mt-2">audit_registry.compact · proveCompliance</div>
</div>

<div class="flex flex-col gap-4">
  <div class="border-l border-hairline pl-4">
    <div class="zk-h3">Predicates over private data</div>
    <div class="zk-body mt-1">A public chain needs the findings on chain to check them. Compact checks them and publishes only the result.</div>
  </div>
  <div class="border-l border-hairline pl-4">
    <div class="zk-h3">Compiler-enforced disclosure</div>
    <div class="zk-body mt-1">Every disclose() is a deliberate hole a reviewer can audit. Nothing leaks by accident.</div>
  </div>
  <div class="border-l border-hairline pl-4">
    <div class="zk-h3">Anonymous set membership</div>
    <div class="zk-body mt-1">A depth-16 historic Merkle tree proves the evidence was attested, without revealing which entry it is.</div>
  </div>
  <div class="border-l border-hairline pl-4">
    <div class="zk-h3">Local proving</div>
    <div class="zk-body mt-1">Proofs are generated on the developer's machine. The chain sees identifiers and a verdict.</div>
  </div>
</div>

</div>

</div>

<!--
[1:25 – 2:00]  ~35s

Point at the code and say the one sentence that matters:

  "This is the whole protocol in six lines. The buyer's thresholds on the right of each
   comparison, the vendor's real numbers on the left — and disclose() wraps the conjunction,
   not the operands. One boolean comes out. Disclose them individually and you have leaked
   which control failed."

Then name the four reasons in about four seconds each. Do not read them:
predicates over private data, compiler-enforced disclosure, anonymous set membership,
local proving.

If a judge asks "why not just sign a JSON": signing reveals the findings. The point is the
comparison without the operands.
-->

---

<div class="flex min-h-[459px] flex-col">

<div>
<div class="zk-eyebrow">Demo</div>
<div class="mt-2 flex items-baseline gap-4">
  <span class="zk-h1">Live demo</span>
  <Pill dot tone="accent">~90 seconds</Pill>
</div>
</div>

<div class="mt-9">

<div class="grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline">
  <div class="bg-card p-5">
    <div class="font-mono text-[12px] tabular-nums text-muted">01</div>
    <div class="zk-h3 mt-3">Sign in, pick a repo</div>
    <div class="zk-body mt-2">GitHub OAuth, then the repository's own workflow runs and produces the evidence artifact.</div>
  </div>
  <div class="bg-card p-5">
    <div class="font-mono text-[12px] tabular-nums text-muted">02</div>
    <div class="zk-h3 mt-3">Pair the local runtime</div>
    <div class="zk-body mt-2">A six-digit code pairs the browser with the companion on loopback. No wallet extension anywhere.</div>
  </div>
  <div class="bg-card p-5">
    <div class="font-mono text-[12px] tabular-nums text-muted">03</div>
    <div class="zk-h3 mt-3">Pick a policy, prove</div>
    <div class="zk-body mt-2">The runtime anchors the commitment, then proves compliance against it. Two transactions.</div>
  </div>
  <div class="bg-card p-5">
    <div class="font-mono text-[12px] tabular-nums text-muted">04</div>
    <div class="zk-h3 mt-3">Read the public record</div>
    <div class="zk-body mt-2">Artifact, policy, validity window, and one boolean. The findings are not there.</div>
  </div>
</div>

<div class="mt-4 flex items-center gap-3 rounded-xl border border-hairline px-4 py-3">
  <span class="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-accent" />
  <span class="zk-body-md">
    The browser never talks to Midnight. The paired runtime holds the wallet, the proof server, and
    the evidence — and it is running on this laptop.
  </span>
</div>

</div>

</div>

<!--
[2:00 – 3:30]  ~90s  — LIVE DEMO

Have the runtime already started and the repository already added. Narrate against these four
beats; they are on screen so the audience can follow even if you get ahead of the UI.

FALLBACK — if anything stalls, do not debug on stage. Say:

  "The runtime is proving locally, so let me walk you through what it is doing while it
   works —" and talk these four cards to the end. Then move on.

Proving takes real time; keep talking through it. Land on the public record and say the line:
"artifact, policy, validity window, one boolean — and nothing else."
-->

---

<div class="flex min-h-[459px] flex-col">

<div>
<div class="zk-eyebrow">Where we are</div>
<div class="zk-h1 mt-2">Built, and honest about the edges.</div>
</div>

<div class="flex flex-1 flex-col justify-center">
  <StatusColumns />
</div>

</div>

<!--
[3:30 – 3:50]  ~20s

CUT THIS SLIDE FIRST if you are running long — jump straight to the close.

If you keep it, do not read the columns. Say:

  "The contract, the policies, the local runtime and the hosted app work today. The public
   dashboard still reads our own database rather than the chain, and we trust GitHub Actions
   to run the measurement. That last one is a signature, not a new protocol — and it is the
   next thing we build."

Naming the gap yourself is worth more than a judge finding it.
-->

---

<div class="flex min-h-[459px] flex-col justify-between">

<div class="flex items-center gap-2.5">
  <span class="zk-mark">zk</span>
  <span class="text-[17px] font-semibold tracking-tight">zkuat</span>
</div>

<div>
  <div class="text-[42px] font-semibold leading-[1.06] tracking-[-0.028em] text-foreground">
    Prove your security posture.<br />Disclose nothing.
  </div>
  <div class="zk-lead mt-5 max-w-[520px]">
    The evidence stays on your machine. The chain carries an artifact identity, a policy,
    an expiry, and one boolean.
  </div>
</div>

<div class="flex items-end justify-between">
  <div class="zk-meta">zkuat.works · Zero-Knowledge Ultimate Audit Tool</div>
  <div class="zk-meta">Hack Buenos Aires 2026</div>
</div>

</div>

<!--
[3:50 – 4:00]  ~10s

"Prove your security posture, disclose nothing. It's live at zkuat.works. Thank you."

Stop talking. Take questions.
-->
