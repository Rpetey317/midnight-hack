"use client";

import { Check, CircleSlash, Clock, Globe, HelpCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ComplianceRecord, Policy, RecordStatus } from "@/lib/types";
import { policyRequirements } from "@/lib/types";
import { fmtDate, relativeDays, shortDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<
  RecordStatus,
  { label: string; tone: string; icon: typeof Check; note: string }
> = {
  compliant: {
    label: "Satisfied",
    tone: "text-success",
    icon: Check,
    note: "A valid zero-knowledge proof establishes this policy is met.",
  },
  expired: {
    label: "Expired",
    tone: "text-warning",
    icon: Clock,
    note: "The proof was valid at the time. Fresh evidence produces a fresh proof.",
  },
  failed: {
    label: "Not satisfied",
    tone: "text-destructive",
    icon: CircleSlash,
    note: "The protocol records a negative verdict. It does not lie.",
  },
  none: {
    label: "No current proof",
    tone: "text-muted-foreground",
    icon: HelpCircle,
    note: "No compliance record exists for this artifact and policy.",
  },
};

export function VerdictPanel({
  record,
  policy,
  status,
  className,
}: {
  record: ComplianceRecord | null;
  policy: Policy;
  status: RecordStatus;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const s = STATUS[status];
  const Icon = s.icon;
  const requirements = policyRequirements(policy);
  const passing = status === "compliant" || status === "expired";

  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-start gap-4 border-b border-border px-6 py-6">
        <motion.span
          initial={reduce ? false : { scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full bg-secondary",
            s.tone,
          )}
        >
          <Icon className="size-5" strokeWidth={1.5} />
        </motion.span>

        <div className="mr-auto min-w-0">
          <h2 className={cn("text-xl font-semibold tracking-tight", s.tone)}>{s.label}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {policy.name} v{policy.version} · issued by {policy.issuer}
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Globe className="size-3" strokeWidth={1.5} />
          Public record
        </span>
      </header>

      {record && (
        <dl className="grid gap-x-6 gap-y-4 border-b border-border px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Vendor" value={record.vendorId} />
          <Meta label="Product" value={record.productId} />
          <Meta label="Evidence date" value={fmtDate(record.provenAt)} />
          <Meta
            label="Valid until"
            value={fmtDate(record.validUntil)}
            sub={relativeDays(record.validUntil)}
          />
          <Meta label="Artifact digest" value={shortDigest(record.artifactDigest, 14, 8)} wide />
          <Meta label="Transaction" value={shortDigest(record.txHash, 14, 8)} wide />
        </dl>
      )}

      <div className="px-6 py-5">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Requirements demonstrated
        </h3>
        <ul className="mt-3 flex flex-col">
          {requirements.map((r, i) => (
            <motion.li
              key={r.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 + i * 0.045, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex min-h-11 items-center gap-3 border-b border-border text-sm last:border-0"
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  passing ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground",
                )}
              >
                {passing ? (
                  <Check className="size-3" strokeWidth={2} />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={passing ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
            </motion.li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-muted-foreground">
          {s.note} No underlying value — vulnerability counts, dependency names, coverage — is
          disclosed by this record, and none appears in the transaction.
        </p>
      </div>
    </section>
  );
}

function Meta({
  label,
  value,
  sub,
  wide,
}: {
  label: string;
  value: string;
  sub?: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", wide && "sm:col-span-2")}>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-sm tabular-nums">{value}</dd>
      {sub && <dd className="truncate text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}
