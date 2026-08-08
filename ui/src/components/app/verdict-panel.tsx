"use client";

import { useState } from "react";
import { Check, ChevronDown, CircleSlash, Clock, Globe, HelpCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComplianceRecord, Policy, RecordStatus } from "@/lib/types";
import { policyRequirements } from "@/lib/types";
import { fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<
  RecordStatus,
  { label: string; tone: string; icon: typeof Check }
> = {
  compliant: {
    label: "Satisfied",
    tone: "text-success",
    icon: Check,
  },
  expired: {
    label: "Expired",
    tone: "text-warning",
    icon: Clock,
  },
  failed: {
    label: "Not satisfied",
    tone: "text-destructive",
    icon: CircleSlash,
  },
  none: {
    label: "No current proof",
    tone: "text-muted-foreground",
    icon: HelpCircle,
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
  const [open, setOpen] = useState(false);
  const s = STATUS[status];
  const Icon = s.icon;
  const requirements = policyRequirements(policy);
  const passing = status === "compliant" || status === "expired";

  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-1.5 px-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6 sm:py-6"
      >
        {/* Status, provenance and the toggle share one row at every width. */}
        <div className="flex w-full items-center gap-2.5 sm:gap-4">
          <motion.span
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full bg-secondary sm:size-11",
              s.tone,
            )}
          >
            <Icon className="size-4 sm:size-5" strokeWidth={1.5} />
          </motion.span>

          <h2 className={cn("truncate text-lg font-semibold tracking-tight sm:text-xl", s.tone)}>
            {s.label}
          </h2>

          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground sm:px-2.5">
            <Globe className="size-3" strokeWidth={1.5} />
            Public record
          </span>

          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={1.5}
          />
        </div>

        <p className="text-sm text-muted-foreground sm:pl-15">
          {policy.name} v{policy.version} · issued by {policy.issuer}
        </p>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.16 }}
            className="overflow-hidden"
          >
            {record && (
              <dl className="grid gap-x-6 gap-y-4 border-t border-border px-6 py-5 sm:grid-cols-2">
                <Meta label="Evidence date" value={fmtDate(record.provenAt)} />
                <Meta
                  label="Valid until"
                  value={fmtDate(record.validUntil)}
                  sub={relativeDays(record.validUntil)}
                />
              </dl>
            )}

            <div className="border-t border-border px-6 py-5">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                Requirements demonstrated
              </h3>
              <ul className="mt-3 flex flex-col">
                {requirements.map((r) => (
                  <li
                    key={r.id}
                    className="flex min-h-11 items-center gap-3 border-b border-border text-sm last:border-0"
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full",
                        passing
                          ? "bg-success/10 text-success"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {passing ? (
                        <Check className="size-3" strokeWidth={2} />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span className={passing ? "text-foreground" : "text-muted-foreground"}>
                      {r.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
