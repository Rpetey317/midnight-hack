import Link from "next/link";
import { ArrowUpRight, ScrollText } from "lucide-react";
import type { Policy } from "@/lib/types";
import { shortDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The policy a proof was checked against. */
export function PolicyDetails({ policy, className }: { policy: Policy; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="flex items-center gap-4 px-6 py-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
          <ScrollText className="size-4" strokeWidth={1.5} />
        </span>
        <span className="mr-auto min-w-0">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            Policy checked
          </span>
          <span className="mt-0.5 block truncate text-base font-medium tracking-tight">
            {policy.name} v{policy.version}
          </span>
        </span>
      </div>

      <div className="border-t border-border px-6 py-5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Meta label="Issuer" value={policy.issuer} />
          <Meta label="Policy id" value={shortDigest(policy.id, 14, 8)} />
          <Meta label="Required attestor" value={policy.requiredAttestor ?? "any registered"} />
          <Meta
            label="Max evidence age"
            value={`${Math.round(policy.maxAgeSeconds / 86400)} days`}
          />
        </dl>

        <Link
          href={`/policies/${policy.slug}`}
          className="mt-5 inline-flex items-center gap-1.5 text-sm underline underline-offset-4 transition-colors hover:text-muted-foreground"
        >
          Open the full policy
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
        </Link>
      </div>
    </section>
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
