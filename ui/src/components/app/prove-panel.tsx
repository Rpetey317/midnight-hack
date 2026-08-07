"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Cpu, X } from "lucide-react";
import { StatefulButton } from "@/components/motion/button/stateful";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { TodoList, type TodoItem } from "@/components/agents/todo-list";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from "@/components/motion/animated-toast-stack";
import { POLICIES } from "@/lib/demo";
import { evaluate, policyRequirements, type Evidence } from "@/lib/types";
import { recordProof } from "@/app/actions";
import { shortDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

type Phase = "idle" | "running" | "done" | "error";

const STEPS = [
  { id: "load", title: "Read local evidence bundle", detail: "Never transmitted" },
  { id: "sigstore", title: "Verify Sigstore bundle", detail: "OIDC subject vs predicate repo" },
  { id: "leaf", title: "Derive commitment", detail: "leafOf(evidence, salt)" },
  { id: "path", title: "Fetch Merkle path", detail: "HistoricMerkleTree<16>" },
  { id: "predicate", title: "Evaluate policy predicate", detail: "In-circuit, over private inputs" },
  { id: "prove", title: "Generate PLONK proof", detail: "Local proving — no third party" },
  { id: "submit", title: "Submit proveCompliance", detail: "Four public inputs" },
] as const;

const DURATIONS = [320, 520, 300, 460, 380, 1150, 700];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fakeTx = () =>
  `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;

export function ProvePanel({
  evidence,
  artifactId,
  className,
}: {
  evidence: Evidence;
  artifactId: string | null;
  className?: string;
}) {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({ limit: 3 });

  const [slug, setSlug] = useState(POLICIES[0].slug);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(-1);
  const [result, setResult] = useState<{ verdict: boolean; txHash: string } | null>(null);

  const policy = useMemo(() => POLICIES.find((p) => p.slug === slug)!, [slug]);
  const requirements = policyRequirements(policy);
  const verdict = evaluate(evidence, policy);

  const items: TodoItem[] = STEPS.map((s, i) => ({
    id: s.id,
    title: s.title,
    detail: s.detail,
    status:
      phase === "done"
        ? "completed"
        : i < stepIndex
          ? "completed"
          : i === stepIndex
            ? "in-progress"
            : "pending",
  }));

  const run = useCallback(async () => {
    setPhase("running");
    setResult(null);
    for (let i = 0; i < STEPS.length; i++) {
      setStepIndex(i);
      await sleep(DURATIONS[i]);
    }
    setStepIndex(STEPS.length);

    const txHash = fakeTx();
    setResult({ verdict, txHash });
    setPhase("done");

    if (artifactId) {
      const res = await recordProof({
        artifactId,
        policySlug: policy.slug,
        policyVersion: policy.version,
        verdict,
        txHash,
      });
      if (!res?.error) router.refresh();
    }

    showToast({
      title: verdict ? "Proof accepted" : "Proof recorded — not satisfied",
      description: verdict
        ? `${policy.name} v${policy.version} · record written on Midnight`
        : "The protocol records a negative verdict rather than failing silently.",
      status: verdict ? "success" : "error",
      duration: 6000,
    });
  }, [artifactId, policy, showToast, router, verdict]);

  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-card", className)}>
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-medium tracking-tight">Prove against a policy</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Proving runs on this machine. The evidence never moves.
        </p>
      </header>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Policy</span>
          <Select
            value={slug}
            onValueChange={(v) => {
              setSlug(v);
              setPhase("idle");
              setStepIndex(-1);
              setResult(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a policy" />
            </SelectTrigger>
            <SelectContent>
              {POLICIES.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {`${p.name} v${p.version}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Issued by {policy.issuer}</p>
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
            Requirements · evaluated locally
          </h3>
          <ul className="mt-2 flex flex-col">
            {requirements.map((r) => {
              const met = requirementMet(r.id, evidence, policy);
              return (
                <li
                  key={r.id}
                  className="flex min-h-11 items-center gap-3 border-b border-border text-sm last:border-0"
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full",
                      met ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {met ? (
                      <Check className="size-3" strokeWidth={2} />
                    ) : (
                      <X className="size-3" strokeWidth={2} />
                    )}
                  </span>
                  <span className={met ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {phase !== "idle" && (
          <TodoList
            items={items}
            title="Proof pipeline"
            defaultOpen
            collapseOnComplete={false}
            className="rounded-xl"
          />
        )}

        {result ? (
          <div
            className={cn(
              "rounded-xl border border-border bg-background p-4",
              result.verdict ? "text-foreground" : "text-foreground",
            )}
          >
            <p
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                result.verdict ? "text-success" : "text-destructive",
              )}
            >
              {result.verdict ? (
                <Check className="size-4" strokeWidth={2} />
              ) : (
                <X className="size-4" strokeWidth={2} />
              )}
              {result.verdict ? "Proof accepted" : "Not satisfied — recorded"}
            </p>
            <p className="mt-1.5 font-mono text-xs text-muted-foreground">
              tx {shortDigest(result.txHash, 16, 10)}
            </p>
            <Link
              href={`/verify/${evidence.artifactDigest.replace(/^sha256:/, "")}?policy=${policy.slug}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Open the verifier view
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        ) : (
          <StatefulButton
            state={phase === "running" ? "loading" : phase === "error" ? "error" : "idle"}
            icon={<Cpu className="size-4" strokeWidth={1.5} />}
            loadingText="Proving locally…"
            errorText="Proof failed"
            onClick={run}
            className="w-full"
          >
            Generate proof
          </StatefulButton>
        )}
      </div>

      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="bottom-right" portal />
    </section>
  );
}

function requirementMet(
  id: string,
  ev: Evidence,
  p: ReturnType<typeof POLICIES.slice>[number],
): boolean {
  switch (id) {
    case "criticals":
      return ev.vulns.criticals <= p.maxCriticals;
    case "highs":
      return ev.vulns.highs <= p.maxHighs;
    case "kev":
      return ev.vulns.kev <= p.maxKev;
    case "forbidden":
      return ev.deps.forbidden <= p.maxForbiddenDeps;
    case "mfa":
      return ev.config.mfaRequired;
    case "branch":
      return ev.config.branchProtected;
    case "provenance":
      return ev.config.buildProvenanceVerified;
    case "freshness":
      return ev.validUntil - ev.generatedAt <= p.maxAgeSeconds + 86400 * 30;
    default:
      return true;
  }
}
