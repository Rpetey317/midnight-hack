import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock } from "lucide-react";
import { SiteHeader } from "@/components/app/site-header";
import { VerdictPanel } from "@/components/app/verdict-panel";
import { AbsencePanel } from "@/components/app/absence-panel";
import { createClient } from "@/lib/supabase/server";
import { POLICIES, RECORDS, rawTransaction } from "@/lib/demo";
import { statusOf, type ComplianceRecord } from "@/lib/types";
import { fmtDate, shortDigest } from "@/lib/format";

export default async function VerifyArtifact({ params, searchParams }: PageProps<"/verify/[artifact]">) {
  const { artifact } = await params;
  const { policy: policyParam } = await searchParams;

  const digest = String(artifact).replace(/^sha256:/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) notFound();

  const slug = typeof policyParam === "string" ? policyParam : POLICIES[0].slug;
  const policy = POLICIES.find((p) => p.slug === slug) ?? POLICIES[0];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const record: ComplianceRecord | null =
    RECORDS.find(
      (r) => r.artifactDigest.replace(/^sha256:/, "") === digest && r.policySlug === policy.slug,
    ) ?? null;

  const status = statusOf(record);
  const timeline = RECORDS.filter((r) => r.policySlug === policy.slug).sort(
    (a, b) => b.provenAt - a.provenAt,
  );

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href="/verify"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
          Verifier
        </Link>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Artifact</p>
          <h1 className="mt-2 break-all font-mono text-lg tracking-tight sm:text-xl">
            sha256:{digest}
          </h1>
        </div>

        <VerdictPanel className="mt-8" record={record} policy={policy} status={status} />

        {record && <AbsencePanel className="mt-6" transaction={rawTransaction(record)} />}

        {!record && (
          <div className="mt-6 rounded-2xl border border-border bg-card px-6 py-8">
            <h2 className="text-sm font-medium tracking-tight">Nothing to show</h2>
            <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
              No compliance record exists for this artifact under {policy.name} v{policy.version}.
              That is not a failure — it means no one has proven this policy for this build. Ask the
              supplier to run an attestation, or check a different policy.
            </p>
          </div>
        )}

        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Clock className="size-3.5" strokeWidth={1.5} />
            Compliance timeline · {policy.name}
          </h2>
          <ol className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
            {timeline.map((r) => {
              const s = statusOf(r);
              const active = r.artifactDigest.replace(/^sha256:/, "") === digest;
              return (
                <li
                  key={r.txHash}
                  className={`flex min-h-14 flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-6 py-3 text-sm last:border-0 ${
                    active ? "bg-secondary" : ""
                  }`}
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      s === "compliant"
                        ? "bg-success"
                        : s === "expired"
                          ? "bg-warning"
                          : "bg-destructive"
                    }`}
                  />
                  <Link
                    href={`/verify/${r.artifactDigest.replace(/^sha256:/, "")}?policy=${r.policySlug}`}
                    className="font-mono text-xs transition-colors hover:text-muted-foreground"
                  >
                    {shortDigest(r.artifactDigest, 12, 6)}
                  </Link>
                  <span className="text-xs capitalize text-muted-foreground">{s}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmtDate(r.provenAt)} → {fmtDate(r.validUntil)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            A record is a statement about a moment, not a permanent badge. Proofs expire; fresh
            evidence produces fresh proofs.
          </p>
        </section>
      </main>
    </>
  );
}
