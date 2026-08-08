import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SiteHeader } from "@/components/app/site-header";
import { createClient } from "@/lib/supabase/server";
import { POLICIES } from "@/lib/demo";
import { policyRequirements } from "@/lib/types";

export default async function PolicyDetail({ params }: PageProps<"/policies/[id]">) {
  const { id } = await params;
  const policy = POLICIES.find((p) => p.slug === id || p.id === id);
  if (!policy) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const thresholds: { label: string; value: string }[] = [
    { label: "Max criticals", value: String(policy.maxCriticals) },
    { label: "Max highs", value: unbounded(policy.maxHighs) },
    { label: "Max vulnerable deps", value: unbounded(policy.maxVulnDeps) },
    { label: "Lint", value: yesNo(policy.requireLint) },
    { label: "Build", value: yesNo(policy.requireBuild) },
    { label: "Max evidence age", value: `${Math.round(policy.maxAgeSeconds / 86400)} days` },
    { label: "Version", value: `v${policy.version}` },
  ];

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href="/policies"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
          Policies
        </Link>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {policy.issuer}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {policy.name} <span className="text-muted-foreground">v{policy.version}</span>
          </h1>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{policy.id}</p>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-6 py-3.5">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
              What a proof against this policy demonstrates
            </h2>
          </header>
          {/* Conditions a proof must satisfy — not results, so no check marks. */}
          <ul className="px-6 py-2">
            {policyRequirements(policy).map((r, i) => (
              <li
                key={r.id}
                className="flex flex-col gap-0.5 border-b border-border py-3 text-sm last:border-0"
              >
                <span className="flex gap-3">
                  <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {r.label}
                </span>
                <code className="pl-7 font-mono text-xs text-muted-foreground">{r.expr}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-6 py-3.5">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
              Thresholds · public ledger state
            </h2>
          </header>
          <dl className="grid gap-x-6 sm:grid-cols-2">
            {thresholds.map((t) => (
              <div
                key={t.label}
                className="flex min-h-12 items-center justify-between gap-4 border-b border-border px-6 py-3 last:border-0 sm:[&:nth-last-child(2)]:border-0"
              >
                <dt className="text-sm text-muted-foreground">{t.label}</dt>
                <dd className="font-mono text-xs tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          These values are the policy. A supplier chooses which policy to prove against but cannot
          quietly edit one — identity is carried by the issuer and the version.
        </p>
      </main>
    </>
  );
}

const unbounded = (n: number) => (n >= 4_294_967_295 ? "unbounded" : String(n));
const yesNo = (b: boolean) => (b ? "required" : "not required");
