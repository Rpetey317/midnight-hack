"use client";

import { useState } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { POLICIES } from "@/lib/demo";
import { policyRequirements } from "@/lib/types";
import { shortDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PolicyList({ className }: { className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const reduce = useReducedMotion() ?? false;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {POLICIES.map((p) => {
        const expanded = open === p.slug;
        return (
          <section
            key={p.slug}
            className={cn(
              "overflow-hidden rounded-2xl border bg-card transition-colors duration-150",
              expanded ? "border-glass-border" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : p.slug)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-4 px-6 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ScrollText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <span className="mr-auto min-w-0">
                <span className="block truncate text-base font-medium tracking-tight">
                  {p.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {p.issuer} · <span className="font-mono">{p.slug}</span>
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                v{p.version}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ type: "spring", duration: 0.5, bounce: 0.16 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border px-6 py-5">
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                      Predicates
                    </h3>
                    {/* Nothing is evaluated here — these are the conditions a
                        proof would have to satisfy, so no check marks. */}
                    <ul className="mt-2 flex flex-col">
                      {policyRequirements(p).map((r, i) => (
                        <li
                          key={r.id}
                          className="flex min-h-11 flex-col justify-center gap-0.5 border-b border-border py-2.5 text-sm last:border-0"
                        >
                          <span className="flex gap-3">
                            <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            {r.label}
                          </span>
                          <code className="pl-7 font-mono text-xs text-muted-foreground">
                            {r.expr}
                          </code>
                        </li>
                      ))}
                    </ul>

                    <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      <Meta label="Policy id" value={shortDigest(p.id, 14, 8)} />
                      <Meta label="Issuer" value={p.issuer} />
                    </dl>

                    <Link
                      href={`/policies/${p.slug}`}
                      className="mt-5 inline-block text-sm underline underline-offset-4 transition-colors hover:text-muted-foreground"
                    >
                      Open the full policy
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs">{value}</dd>
    </div>
  );
}
