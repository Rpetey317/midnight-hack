import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Boxes, CheckCircle2, GitCommitHorizontal, ScrollText } from "lucide-react";
import { AppNav } from "@/components/app/app-nav";
import { AddRepoDialog } from "@/components/app/add-repo-dialog";
import { SeedDemoButton } from "@/components/app/seed-demo-button";
import { NumberTicker } from "@/components/motion/number-ticker";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/queries";
import { POLICIES } from "@/lib/demo";
import { shortCommit, shortDigest } from "@/lib/format";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const handle = user.user_metadata?.user_name ?? user.email?.split("@")[0] ?? "you";
  const { products, artifacts, proofs } = await getWorkspace();

  const stats = [
    { label: "Repositories", value: products.length, icon: Boxes },
    { label: "Artifacts", value: artifacts.length, icon: GitCommitHorizontal },
    { label: "Proofs", value: proofs.length, icon: CheckCircle2 },
    { label: "Policies", value: POLICIES.length, icon: ScrollText },
  ];

  return (
    <>
      <AppNav handle={handle} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="font-mono text-foreground">@{handle}</span>. Evidence is generated and
              proven locally — nothing here holds a finding.
            </p>
          </div>
          {products.length > 0 && <AddRepoDialog />}
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-2 bg-card px-6 py-5">
              <dt className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <s.icon className="size-3.5" strokeWidth={1.5} />
                {s.label}
              </dt>
              <dd>
                <NumberTicker
                  value={s.value}
                  locale
                  className="font-mono text-2xl font-medium tabular-nums tracking-tight"
                />
              </dd>
            </div>
          ))}
        </dl>

        {products.length === 0 ? (
          <div className="mt-8 flex flex-col items-start gap-5 rounded-2xl border border-border bg-card px-6 py-12">
            <div>
              <h2 className="text-lg font-medium tracking-tight">No repositories yet</h2>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                Add a repository to attest, or load the demo repository to walk the full
                attest → anchor → prove → verify path with fixture evidence.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AddRepoDialog />
              <SeedDemoButton />
            </div>
          </div>
        ) : (
          <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-6 py-3.5">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
                Attested repositories
              </h2>
              <SeedDemoButton variant="ghost" />
            </header>

            <ul>
              {products.map((p) => {
                const own = artifacts.filter((a) => a.product_id === p.id);
                const latest = own[0];
                const ids = new Set(own.map((a) => a.id));
                const count = proofs.filter((x) => ids.has(x.artifact_id)).length;

                return (
                  <li key={p.id} className="border-b border-border last:border-0">
                    <Link
                      href={`/attester/${p.id}`}
                      className="group flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 transition-colors duration-150 hover:bg-secondary"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm">{p.repo}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {latest
                            ? `${shortDigest(latest.digest)} · ${
                                latest.commit_sha ? shortCommit(latest.commit_sha) : "no commit"
                              }`
                            : "No artifacts yet"}
                        </p>
                      </div>

                      <div className="flex items-center gap-6 text-xs text-muted-foreground">
                        <span className="font-mono tabular-nums">
                          {own.length} artifact{own.length === 1 ? "" : "s"}
                        </span>
                        <span className="font-mono tabular-nums">
                          {count} proof{count === 1 ? "" : "s"}
                        </span>
                        <ArrowRight
                          className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                          strokeWidth={1.5}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
