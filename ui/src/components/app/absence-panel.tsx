"use client";

import { EyeOff } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { CodeBlock } from "@/components/agents/code-block";
import { cn } from "@/lib/utils";

/** Fields that are deliberately absent from the transaction. §02 threat model. */
const ABSENT = [
  "criticals",
  "highs",
  "totalVulnerabilities",
  "lintPassed",
  "buildPassed",
  "salt",
  "leaf",
  "merklePath",
  "commitId",
];

export function AbsencePanel({
  transaction,
  className,
}: {
  transaction: string;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;

  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <EyeOff className="size-4 text-muted-foreground" strokeWidth={1.5} />
        <div className="mr-auto">
          <h2 className="text-sm font-medium tracking-tight">The transaction, in full</h2>
          <p className="text-xs text-muted-foreground">
            Everything a verifier can read from the chain.
          </p>
        </div>
      </header>

      <div className="px-6 py-5">
        <CodeBlock
          code={transaction}
          language="json"
          filename="proveCompliance.tx.json"
          showLineNumbers
          maxHeight={360}
          copyable
        />

        <h3 className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">
          Absent by construction
        </h3>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {ABSENT.map((field, i) => (
            <motion.li
              key={field}
              initial={reduce ? false : { opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ delay: i * 0.025, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground line-through decoration-muted-foreground/40"
            >
              {field}
            </motion.li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          None of these appears above, and none is recoverable from what does. The circuit discloses
          the comparison, never the operands.
        </p>
      </div>
    </section>
  );
}
