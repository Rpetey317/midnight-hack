import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock } from "lucide-react";
import { SiteHeader } from "@/components/app/site-header";
import { VerdictPanel } from "@/components/app/verdict-panel";
import { PolicyDetails } from "@/components/app/policy-details";
import { CopyField } from "@/components/app/copy-field";
import { createClient } from "@/lib/supabase/server";
import { getAudit, getAuditsForRepo } from "@/lib/queries";
import { UUID_RE, policyFor, recordFromAudit } from "@/lib/audit";
import { statusOf } from "@/lib/types";
import { fmtDate, shortCommit, shortDigest } from "@/lib/format";

export default async function VerifyAudit({ params }: PageProps<"/verify/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const audit = await getAudit(id);
  if (!audit) notFound();

  const policy = policyFor(audit.proof.policy_id);
  const record = recordFromAudit(audit);
  const status = statusOf(record);

  // Sibling audits over the same repository, so a verifier sees the history.
  const siblings = (await getAuditsForRepo(audit.repo)).filter((a) => a.proof.id !== id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Audit</p>
          <h1 className="mt-2 break-all font-mono text-lg tracking-tight sm:text-xl">
            {audit.repo}
          </h1>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground sm:text-sm">{id}</p>
        </div>

        <VerdictPanel className="mt-8" record={record} policy={policy} status={status} />

        <section className="mt-6 rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-6 py-3.5">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
              Check it yourself
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Everything you need to re-derive this proof independently. Click any value to copy it.
            </p>
          </header>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <CopyField label="Repository" value={audit.repo} />
            <CopyField
              label="Commit"
              value={audit.commitSha ?? ""}
              display={audit.commitSha ? shortCommit(audit.commitSha) : undefined}
            />
            <CopyField
              label="Proof hash"
              value={audit.proof.tx_hash ?? ""}
              display={audit.proof.tx_hash ? shortDigest(audit.proof.tx_hash, 18, 12) : undefined}
            />
            <CopyField label="Proof id" value={audit.proof.id} />
          </div>
        </section>

        <PolicyDetails className="mt-6" policy={policy} />

        {siblings.length > 0 && (
          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Clock className="size-3.5" strokeWidth={1.5} />
              Other audits for {audit.repo}
            </h2>
            <ol className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
              {siblings.map((a) => {
                const s = statusOf(recordFromAudit(a));
                return (
                  <li key={a.proof.id} className="border-b border-border last:border-0">
                    <Link
                      href={`/verify/${a.proof.id}`}
                      className="flex min-h-14 items-center gap-2.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-secondary sm:px-6"
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
                      {/* The dot carries the status; keep it readable without colour. */}
                      <span className="sr-only">{s}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {policyFor(a.proof.policy_id).name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fmtDate(Date.parse(a.proof.created_at) / 1000)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </main>
    </>
  );
}
