<script setup lang="ts">
/**
 * The `proveCompliance` predicate from `contract/src/audit_registry.compact`,
 * verbatim.
 *
 * Hand-built rather than a markdown fence: Shiki's default theme paints this in
 * four colours, and design-system.md §9 ships no decorative palette. Two tones
 * carry the whole point instead — `disclose(` and the private operands in
 * foreground, everything else muted — so the eye lands on the boundary the
 * slide is about.
 */
</script>

<template>
  <pre class="zk-card overflow-visible p-4 font-mono text-[11.5px] leading-[1.72]"><code><span class="text-muted">const</span> <span class="text-foreground">ok</span> <span class="text-muted">=</span> <span class="text-foreground font-medium">disclose</span><span class="text-muted">(</span>
  <span class="text-foreground">ev.criticals</span> <span class="text-muted">&lt;= p.maxCriticals &amp;&amp;</span>
  <span class="text-foreground">ev.highs    </span> <span class="text-muted">&lt;= p.maxHighs     &amp;&amp;</span>
  <span class="text-foreground">ev.totalVulnerabilities</span> <span class="text-muted">&lt;= p.maxTotalVulnerabilities &amp;&amp;</span>
  <span class="text-muted">(!p.requireLint  || </span><span class="text-foreground">ev.lintPassed</span><span class="text-muted">) &amp;&amp;</span>
  <span class="text-muted">(!p.requireBuild || </span><span class="text-foreground">ev.buildPassed</span><span class="text-muted">)</span>
<span class="text-muted">);</span></code></pre>
</template>
