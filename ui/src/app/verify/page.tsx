import { SiteHeader } from "@/components/app/site-header";
import { VerifyForm } from "@/components/app/verify-form";
import { createClient } from "@/lib/supabase/server";
import { getRecentAudits } from "@/lib/queries";

export default async function VerifyIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Demo affordance: real values from the newest audit, so the fill buttons
  // always point at something that resolves.
  const [latest] = await getRecentAudits(1);

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Verifier</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Look up an audit.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Enter a repository name to see every audit run over it, or a proof id to open one
          directly. No sign-in needed; compliance records are public ledger state.
        </p>

        <div className="mt-8">
          <VerifyForm sampleRepo={latest?.repo ?? ""} sampleProofId={latest?.proof.id ?? ""} />
        </div>

      </main>
    </>
  );
}
