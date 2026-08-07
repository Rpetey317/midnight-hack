import Link from "next/link";
import { ArrowRight, EyeOff } from "lucide-react";
import { SiteHeader } from "@/components/app/site-header";
import { VerifyForm } from "@/components/app/verify-form";
import { createClient } from "@/lib/supabase/server";
import { POLICIES, RECORDS } from "@/lib/demo";
import { fmtDate, shortDigest } from "@/lib/format";

export default async function VerifyIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const samples = RECORDS.slice(0, 3);

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Verifier</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Check an artifact against a policy.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Enter the digest of a build artifact and the policy you require. You will get a verdict,
          an evidence date, and an expiry — and nothing else. No sign-in needed; compliance records
          are public ledger state.
        </p>

        <div className="mt-8">
          <VerifyForm />
        </div>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
            Recent public records
          </h2>
          <ul className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
            {samples.map((r) => (
              <li key={`${r.artifactDigest}-${r.policySlug}`} className="border-b border-border last:border-0">
                <Link
                  href={`/verify/${r.artifactDigest.replace(/^sha256:/, "")}?policy=${r.policySlug}`}
                  className="group flex min-h-16 flex-wrap items-center gap-x-6 gap-y-1 px-6 py-4 transition-colors duration-150 hover:bg-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{shortDigest(r.artifactDigest, 16, 8)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.vendorId} / {r.productId} ·{" "}
                      {POLICIES.find((p) => p.slug === r.policySlug)?.name}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.provenAt)}</span>
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
          A record tells you a policy was satisfied by authenticated evidence at a moment in time. It
          does not tell you the vulnerability counts, the dependency list, the coverage figure, or
          which leaf of the attestation tree was proven.
        </p>
      </main>
    </>
  );
}
