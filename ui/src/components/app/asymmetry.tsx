"use client";

import { ArrowRight, Check, Lock } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { NumberTicker } from "@/components/motion/number-ticker";
import { EVIDENCE, POLICIES } from "@/lib/demo";
import { policyRequirements } from "@/lib/types";
import { shortDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRIVATE_ROWS = [
  { label: "Critical vulnerabilities", value: EVIDENCE.vulns.criticals },
  { label: "High vulnerabilities", value: EVIDENCE.vulns.highs },
  { label: "Vulnerable dependencies", value: EVIDENCE.vulns.vulnerableDependencies },
];

export function Asymmetry() {
  const reduce = useReducedMotion() ?? false;
  const policy = POLICIES[0];
  const requirements = policyRequirements(policy).slice(0, 5);

  return (
    <div className="relative grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch lg:gap-0">
      {/* Private side */}
      <div className="rounded-2xl border border-border bg-card p-6 lg:rounded-r-none lg:border-r-0">
        <div className="flex items-center gap-2.5">
          <Lock className="size-4 text-warning" strokeWidth={1.5} />
          <span className="text-sm font-medium tracking-tight">What the local runtime holds</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {EVIDENCE.repo} · never written to Midnight
        </p>

        <ul className="mt-5 flex flex-col">
          {PRIVATE_ROWS.map((row) => (
            <li
              key={row.label}
              className="flex min-h-11 items-center justify-between gap-4 border-b border-border text-sm last:border-0"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <NumberTicker
                value={row.value}
                locale
                className="font-mono text-sm tabular-nums"
              />
            </li>
          ))}
        </ul>

        <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-warning">
          Private — not written to Midnight
        </p>
      </div>

      {/* The membrane */}
      <div className="relative flex items-center justify-center py-2 lg:w-20 lg:py-0">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border lg:inset-x-auto lg:inset-y-0 lg:left-1/2 lg:h-auto lg:w-px" />
        <motion.div
          initial={reduce ? false : { scale: 0.85, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className="relative z-10 flex items-center gap-1.5 rounded-full border border-glass-border bg-background px-3 py-1.5"
        >
          <span className="size-1.5 rounded-full bg-accent" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            ZK proof
          </span>
          <ArrowRight className="size-3 text-muted-foreground lg:hidden" strokeWidth={1.5} />
        </motion.div>
      </div>

      {/* Public side */}
      <div className="rounded-2xl border border-border bg-card p-6 lg:rounded-l-none lg:border-l-0">
        <div className="flex items-center gap-2.5">
          <span className="grid size-5 place-items-center rounded-full bg-success/10 text-success">
            <Check className="size-3" strokeWidth={2} />
          </span>
          <span className="text-sm font-medium tracking-tight">What the verifier sees</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {policy.name} v{policy.version} · satisfied
        </p>

        <ul className="mt-5 flex flex-col">
          {requirements.map((r, i) => (
            <motion.li
              key={r.id}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex min-h-11 items-center gap-3 border-b border-border text-sm last:border-0"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                <Check className="size-3" strokeWidth={2} />
              </span>
              <span>{r.label}</span>
            </motion.li>
          ))}
        </ul>

        <p className="mt-5 truncate font-mono text-xs text-muted-foreground">
          artifact {shortDigest(EVIDENCE.artifactDigest)}
        </p>
      </div>
    </div>
  );
}

export function AsymmetryNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Every number on the left is absent from the right — and absent from the chain. The verifier
      gets the boolean it actually needed.
    </p>
  );
}
