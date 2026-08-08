import Link from "next/link";
import {
  ArrowRight,
  FileCheck2,
  GitBranch,
  Landmark,
  Lock,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/app/site-header";
import { GithubSignIn } from "@/components/app/github-sign-in";
import { Asymmetry, AsymmetryNote } from "@/components/app/asymmetry";
import { Logo } from "@/components/app/logo";
import { ButtonLink } from "@/components/motion/button/base";
import { TextReveal } from "@/components/motion/text-reveal";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { TiltCard } from "@/components/motion/tilt-card";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  {
    icon: ScanLine,
    title: "Your CI measures",
    body: "The repository's own workflow runs the checks and writes a canonical evidence bundle. It never leaves the repository.",
  },
  {
    icon: GitBranch,
    title: "GitHub signs a commitment",
    body: "A salted commitment to that evidence is signed under the repo's OIDC identity — the same trust root SLSA and npm provenance use.",
  },
  {
    icon: Lock,
    title: "The commitment is anchored",
    body: "Only the commitment enters Midnight, inserted into a historic Merkle tree. The evidence is nowhere on chain.",
  },
  {
    icon: FileCheck2,
    title: "You prove, locally",
    body: "A zero-knowledge proof generated on your machine shows the anchored evidence satisfies a published policy. One boolean is disclosed.",
  },
];

const USES = [
  {
    icon: Landmark,
    title: "Vendor security review",
    body: "Answer fifty enterprise questionnaires without fifty NDAs and fifty document exchanges.",
  },
  {
    icon: ShieldCheck,
    title: "Supply chain assurance",
    body: "A dependency demonstrates green CI and zero criticals continuously, without publishing a map of its weak points.",
  },
  {
    icon: FileCheck2,
    title: "Continuous compliance",
    body: "Per-commit control attestation with an expiry date, instead of an annual snapshot in a shared drive.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1">
            <span className="size-1.5 rounded-full bg-accent" />
            <span className="text-xs font-medium text-muted-foreground">
              Zero-knowledge attestation on Midnight
            </span>
          </div>

          <TextReveal
            as="h1"
            text={["Prove your security posture.", "Disclose nothing."]}
            split="word"
            className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          />

          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
            Every security review forces the same trade: to prove your codebase is healthy, you hand
            over your source, your CI logs, and your vulnerability findings.{" "}
            <span className="text-foreground">The evidence is the exposure.</span> The verifier never
            needed it — they needed a boolean.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <GithubSignIn label="Start attesting" />
            <ButtonLink href="/verify" variant="secondary">
              Look up an audit
              <ArrowRight className="size-4" strokeWidth={1.5} />
            </ButtonLink>
          </div>
        </section>

        {/* The asymmetry */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              The asymmetry
            </p>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              One artifact. Two irreconcilable views.
            </h2>
            <AsymmetryNote className="mt-3 max-w-xl" />
          </ScrollReveal>

          <div className="mt-10">
            <Asymmetry />
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">How it works</p>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Four steps, and the evidence never moves.
            </h2>
          </ScrollReveal>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {STEPS.map((step, i) => (
              <li key={step.title} className="bg-card p-6">
                {/* Mobile puts the title beside the marker; sm stacks them. */}
                <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground">
                      <step.icon className="size-4" strokeWidth={1.5} />
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="text-lg font-medium tracking-tight sm:mt-4">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground sm:mt-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Why it needs Midnight */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="rounded-2xl border border-border bg-card p-8 sm:p-10">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Why this needs Midnight
              </p>
              <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Remove the zero-knowledge layer and you are back to emailing a PDF.
              </h2>
              <div className="mt-8 grid gap-8 sm:grid-cols-2">
                <Reason
                  title="Predicates over private data"
                  body="A public chain would need the evidence on chain to check the policy. Compact evaluates the predicate and discloses only the result."
                />
                <Reason
                  title="Compiler-enforced disclosure"
                  body="Every disclose() is a deliberate hole a reviewer can audit. The comparison is disclosed; the operands never are."
                />
                <Reason
                  title="Anonymous set membership"
                  body="A historic Merkle tree lets a repository prove it belongs to the attested set without revealing which member it is."
                />
                <Reason
                  title="Local proving"
                  body="Proofs are generated on the developer's machine. No third party ever receives the evidence — which is the entire point."
                />
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* Use cases */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Where it applies
            </p>
          </ScrollReveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {USES.map((u) => (
              <TiltCard key={u.title} max={6} className="h-full rounded-2xl">
                <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                      <u.icon className="size-4" strokeWidth={1.5} />
                    </span>
                    <h3 className="text-base font-medium tracking-tight sm:mt-4">{u.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:mt-2">{u.body}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-border bg-card p-8 sm:flex-row sm:items-center sm:p-10">
            <div className="mr-auto">
              <h2 className="text-xl font-semibold tracking-tight">
                Attest your first repository
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Sign in with GitHub. Your findings stay on your machine — only the repository name,
                the artifact digest and the verdict are ever recorded.
              </p>
            </div>
            <GithubSignIn label="Sign in with GitHub" />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-4 px-4 py-8 sm:px-6 lg:px-8">
          <Logo />
          <p className="text-xs text-muted-foreground">
            Zero-Knowledge Ultimate Audit Tool · Hack Buenos Aires 2026
          </p>
          <nav className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/verify" className="transition-colors hover:text-foreground">
              Verify
            </Link>
            <Link href="/policies" className="transition-colors hover:text-foreground">
              Policies
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Reason({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l border-border pl-4">
      <h3 className="text-sm font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
