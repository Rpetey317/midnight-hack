"use client";

import { Check, EyeOff, Lock, Minus } from "lucide-react";
import { NumberTicker } from "@/components/motion/number-ticker";
import { Tooltip } from "@/components/motion/tooltip";
import type { Evidence } from "@/lib/types";
import { fmtDateTime, shortCommit, shortDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

type Metric = { label: string; value: number; suffix?: string; hint: string };

function metricsOf(ev: Evidence): Metric[] {
  return [
    { label: "Critical", value: ev.vulns.criticals, hint: "Critical-severity advisories" },
    { label: "High", value: ev.vulns.highs, hint: "High-severity advisories" },
    {
      label: "Vulnerable deps",
      value: ev.vulns.vulnerableDependencies,
      hint: "Dependencies with an open advisory",
    },
  ];
}

function BoolRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-xs tabular-nums",
          ok ? "text-success" : "text-muted-foreground",
        )}
      >
        {ok ? <Check className="size-3.5" strokeWidth={1.5} /> : <Minus className="size-3.5" strokeWidth={1.5} />}
        {ok ? "true" : "false"}
      </span>
    </div>
  );
}

export function EvidencePanel({
  evidence,
  className,
  compact = false,
}: {
  evidence: Evidence;
  className?: string;
  compact?: boolean;
}) {
  const metrics = metricsOf(evidence);

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <Lock className="size-4 text-warning" strokeWidth={1.5} />
        <div className="mr-auto">
          <h2 className="text-sm font-medium tracking-tight">Private evidence</h2>
          <p className="text-xs text-muted-foreground">
            {evidence.repo} · {shortCommit(evidence.commit)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-warning">
          <EyeOff className="size-3" strokeWidth={1.5} />
          Not written to Midnight
        </span>
      </header>

      <div className="grid grid-cols-1 gap-px overflow-hidden bg-border sm:grid-cols-3">
        {metrics.map((m) => (
          <Tooltip key={m.label} content={m.hint} side="top" wrapperClassName="block h-full">
            <div className="flex h-full flex-col gap-1 bg-card px-6 py-5">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {m.label}
              </span>
              <NumberTicker
                value={m.value}
                locale
                className="font-mono text-2xl font-medium tabular-nums tracking-tight"
              />
            </div>
          </Tooltip>
        ))}
      </div>

      {!compact && (
        <>
          <div className="flex flex-col px-6 py-2">
            <BoolRow label="Lint passed" ok={evidence.checks.lintPassed} />
            <BoolRow label="Build passed" ok={evidence.checks.buildPassed} />
          </div>

          <footer className="grid gap-x-6 gap-y-3 border-t border-border px-6 py-4 sm:grid-cols-2">
            <Field label="Artifact digest" value={shortDigest(evidence.artifactDigest)} public />
            <Field label="Schema" value={evidence.schema} />
            <Field label="Generated" value={fmtDateTime(evidence.generatedAt)} />
            <Field label="Valid until" value={fmtDateTime(evidence.validUntil)} />
          </footer>
        </>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  public: isPublic,
}: {
  label: string;
  value: string;
  public?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        {isPublic && (
          <span className="rounded-full bg-secondary px-1.5 text-[10px] normal-case tracking-normal text-muted-foreground">
            public
          </span>
        )}
      </span>
      <span className="truncate font-mono text-xs tabular-nums">{value}</span>
    </div>
  );
}
