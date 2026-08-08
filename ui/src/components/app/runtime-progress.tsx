"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";
import { TodoList, type TodoItem, type TodoItemStatus } from "@/components/agents/todo-list";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Loader } from "@/components/motion/loader";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { CopyField } from "@/components/app/copy-field";
import { EASE_OUT } from "@/lib/ease";
import { fmtDate } from "@/lib/format";
import { isTerminalStatus, type RuntimeJob, type RuntimeJobStatus } from "@/lib/runtime";

/**
 * Ledger times arrive as strings — unix seconds straight off the Compact record,
 * or an ISO instant once something has parsed it. Take either, and show the raw
 * value rather than "Invalid Date" if it is neither.
 */
function fmtLedgerTime(value: string): string {
  const seconds = /^\d+$/.test(value) ? Number(value) : Date.parse(value) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? fmtDate(seconds) : value;
}

/**
 * The runtime pipeline in the order it reports. `queued` precedes these and the
 * four terminal states follow them, so this list is exactly the work that has a
 * step of its own.
 */
const PHASES: { status: RuntimeJobStatus; label: string; detail: string }[] = [
  { status: "validating-source", label: "Validate the GitHub source", detail: "run + artifact" },
  { status: "persisting-private-evidence", label: "Persist the private evidence", detail: "local only" },
  { status: "starting-proof-server", label: "Start the proof server", detail: "on this machine" },
  { status: "syncing-wallet", label: "Sync the wallet", detail: "to chain tip" },
  { status: "checking-anchor-identity", label: "Check the anchor identity", detail: "already anchored?" },
  { status: "anchoring", label: "Anchor the commitment", detail: "Merkle insert" },
  { status: "confirming-anchor", label: "Confirm the anchor", detail: "await settle" },
  { status: "retrieving-merkle-path", label: "Retrieve the Merkle path", detail: "authentication path" },
  { status: "proving-compliance", label: "Prove compliance", detail: "zero-knowledge proof" },
  { status: "submitting", label: "Submit the proof", detail: "to Midnight" },
  { status: "verifying-on-chain", label: "Verify on chain", detail: "read the record back" },
];

export function RuntimeProgress({ job }: { job: RuntimeJob }) {
  const reduce = useReducedMotion() ?? false;

  const running = !isTerminalStatus(job.status);
  const broke = job.status === "failed" || job.status === "cancelled";
  const active = PHASES.findIndex((phase) => phase.status === job.status);
  const stoppedAt = PHASES.findIndex((phase) => phase.status === job.stoppedAt);
  const compliant = job.verification?.record.compliant;

  const statusFor = (index: number): TodoItemStatus => {
    // `verified` and `rejected` both mean the pipeline ran to the end — they
    // differ only in the verdict it carried back, which the receipt reports.
    if (!running && !broke) return "completed";
    if (broke) {
      if (index < stoppedAt) return "completed";
      return index === stoppedAt ? "cancelled" : "pending";
    }
    if (index < active) return "completed";
    return index === active ? "in-progress" : "pending";
  };

  const items: TodoItem[] = PHASES.map((phase, index) => ({
    id: phase.status,
    title: phase.label,
    // Narrow screens have no room for both columns, and the label carries the
    // step — the metadata is the part that can go.
    detail: <span className="max-sm:hidden">{phase.detail}</span>,
    status: statusFor(index),
  }));

  const headline = broke
    ? job.error ?? "The run stopped before a verdict"
    : job.status === "verified"
      ? "Verified on chain"
      : job.status === "rejected"
        ? "Proved — the policy was not satisfied"
        : job.status === "queued"
          ? "Queued"
          : (PHASES[active]?.label ?? "Working");

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
      {/* Live strip — the one line worth reading while the proof runs. */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <span className="grid size-8 shrink-0 place-items-center">
          <AnimatePresence initial={false} mode="popLayout">
            {running ? (
              <motion.span
                key="running"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={reduce ? { duration: 0.15 } : { duration: 0.2, ease: EASE_OUT }}
                className="text-foreground"
              >
                <Loader variant="comet" size={22} speed={0.9} label={headline} />
              </motion.span>
            ) : (
              <motion.span
                key="settled"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={reduce ? { duration: 0.15 } : { duration: 0.2, ease: EASE_OUT }}
                className={
                  broke || compliant === false
                    ? "grid size-6 place-items-center rounded-full bg-destructive/10 text-destructive"
                    : "grid size-6 place-items-center rounded-full bg-success/10 text-success"
                }
              >
                {broke || compliant === false ? (
                  <X className="size-3.5" strokeWidth={2.5} />
                ) : (
                  <Check className="size-3.5" strokeWidth={2.5} />
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <div className="min-w-0 flex-1">
          {running ? (
            <TextShimmer className="block truncate text-sm font-medium">
              {headline}
            </TextShimmer>
          ) : (
            <p className="truncate text-sm font-medium">{headline}</p>
          )}
          <p className="truncate font-mono text-xs text-muted-foreground">job {job.id}</p>
        </div>

        <AnimatedBadge
          size="sm"
          status={running ? "loading" : broke ? "danger" : compliant === false ? "warning" : "success"}
          contentKey={job.status}
          pulse={running}
          className="shrink-0 max-sm:hidden"
        >
          {job.status.replaceAll("-", " ")}
        </AnimatedBadge>
      </div>

      <TodoList
        items={items}
        title="Local proving pipeline"
        collapseOnComplete={false}
        strikeCompleted={false}
        maxHeight={264}
        className="rounded-none border-0"
      />

      {/* Receipt — the public half, filled in as each transaction lands. */}
      <AnimatePresence initial={false}>
        {(job.anchor || job.proof || job.verification) && (
          <motion.div
            key="receipt"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduce ? { duration: 0.15 } : { duration: 0.28, ease: EASE_OUT }}
            className="overflow-hidden border-t border-border"
          >
            <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
              {job.anchor && (
                <CopyField label="Anchor transaction" value={job.anchor.txId} />
              )}
              {job.proof && <CopyField label="Proof transaction" value={job.proof.txId} />}
            </div>

            {job.verification && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3.5">
                <AnimatedBadge
                  size="sm"
                  status={job.verification.record.compliant ? "success" : "danger"}
                >
                  {job.verification.record.compliant
                    ? "Policy satisfied"
                    : "Policy not satisfied"}
                </AnimatedBadge>
                <p className="font-mono text-xs text-muted-foreground">
                  policy v{job.verification.record.policyVersion} · valid until{" "}
                  {fmtLedgerTime(job.verification.record.validUntil)}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
