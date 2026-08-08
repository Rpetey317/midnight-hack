import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { AppNav } from "@/components/app/app-nav";
import { EvidencePanel } from "@/components/app/evidence-panel";
import { ArtifactPicker } from "@/components/app/artifact-picker";
import { GithubEvidenceValidation } from "@/components/app/github-evidence-validation";
import { createClient } from "@/lib/supabase/server";
import { getProduct } from "@/lib/queries";
import { findPolicy } from "@/lib/audit";
import { evidenceFor } from "@/lib/demo";
import { fmtDate, shortCommit, shortDigest } from "@/lib/format";

export default async function AttesterProduct({
  params,
  searchParams,
}: PageProps<"/attester/[product]">) {
  const { product: productId } = await params;
  const { artifact: selected } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const handle = user.user_metadata?.user_name ?? user.email?.split("@")[0] ?? "you";
  const data = await getProduct(productId);
  if (!data) notFound();

  const { product, artifacts, proofs } = data;
  const current =
    artifacts.find((a) => a.digest === selected) ?? artifacts[0] ?? null;
  const evidence = evidenceFor(
    current?.digest ?? "",
    product.repo,
    current?.commit_sha ?? null,
  );

  return (
    <>
      <AppNav handle={handle} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
          Repositories
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-mono text-2xl font-semibold tracking-tight">
              {product.repo}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {proofs.length} proof{proofs.length === 1 ? "" : "s"} on record
            </p>
          </div>
          <a
            href={`https://github.com/${product.repo}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View on GitHub
            <ExternalLink className="size-3.5" strokeWidth={1.5} />
          </a>
        </div>

        <GithubEvidenceValidation productId={product.id} />

        {artifacts.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-card px-6 py-12">
            <h2 className="text-lg font-medium tracking-tight">No proofs yet</h2>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              Request repository validation above to retrieve its GitHub Actions evidence and
              submit a proof through the paired local runtime.
            </p>
          </div>
        ) : (
          <>
            {artifacts.length > 1 && (
              <ArtifactPicker
                className="mt-8"
                productId={product.id}
                artifacts={artifacts.map((a) => ({
                  digest: a.digest,
                  commit: a.commit_sha,
                  builtAt: a.built_at,
                }))}
                selected={current!.digest}
              />
            )}

            <EvidencePanel evidence={evidence} className="mt-8" />
          </>
        )}

        {proofs.length > 0 && (
          <section className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
            <header className="border-b border-border px-6 py-3.5">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
                Proof history
              </h2>
            </header>
            <ul>
              {proofs.map((p) => {
                const policy = findPolicy(p.policy_id);
                return (
                <li key={p.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/verify/${p.id}`}
                    className="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 text-sm transition-colors duration-150 hover:bg-secondary"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${
                          p.verdict ? "bg-success" : "bg-destructive"
                        }`}
                      />
                      {/* Never name a policy the proof may not have been made against. */}
                      <span className={policy ? undefined : "font-mono text-xs"}>
                        {policy?.name ?? p.policy_id}
                      </span>
                      <span className="text-muted-foreground">v{p.policy_version}</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.tx_hash ? shortDigest(p.tx_hash, 12, 8) : "pre-anchored"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {fmtDate(Date.parse(p.created_at) / 1000)}
                    </span>
                  </Link>
                </li>
                );
              })}
            </ul>
          </section>
        )}

        {current && (
          <p className="mt-6 text-xs text-muted-foreground">
            Evidence shown for
            {current.commit_sha ? ` commit ${shortCommit(current.commit_sha)} ·` : ""}{" "}
            {shortDigest(current.digest)}
          </p>
        )}
      </main>
    </>
  );
}
