import { Landmark, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/app/site-header";
import { PolicyList } from "@/components/app/policy-list";
import { createClient } from "@/lib/supabase/server";
import { POLICIES } from "@/lib/demo";

export default async function Policies() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Registry</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Published policies</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Thresholds live in public ledger state, so a verifier knows exactly what a record means. A
          supplier may choose which policy to prove against, but cannot quietly edit one — identity
          is carried by the issuer and the version.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Stat icon={Landmark} label="Registered policies" value={String(POLICIES.length)} />
          <Stat
            icon={ShieldCheck}
            label="Evidence schema"
            value="zkuat.evidence.v4"
            mono
          />
        </div>

        <PolicyList className="mt-8" />

        <p className="mt-8 text-xs leading-5 text-muted-foreground">
          The same GitHub artifact can be prepared and proved against every policy here. The scanner
          that measured it never knew these policies existed — which is the argument for evaluating
          predicates in a circuit rather than having the scanner sign a verdict.
        </p>
      </main>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.5} />
        {label}
      </p>
      <p className={`mt-1.5 text-lg tracking-tight ${mono ? "font-mono text-sm" : "font-medium"}`}>
        {value}
      </p>
    </div>
  );
}
