"use client";

import { useState, useTransition } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { StatefulButton } from "@/components/motion/button/stateful";
import { GithubIcon } from "@/components/app/github-icon";
import { requestRepositoryEvidence } from "@/app/actions";

type Result = Exclude<Awaited<ReturnType<typeof requestRepositoryEvidence>>, { error: string }>;

export function GithubEvidenceValidation({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const next = await requestRepositoryEvidence(productId);
      if ("error" in next) {
        setError(next.error ?? "Could not retrieve evidence.");
        return;
      }
      setResult(next);
    });
  };

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-sm font-medium tracking-tight">GitHub evidence retrieval</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dispatch the repository workflow, wait for completion, and parse evidence.json.
          </p>
        </div>
        <StatefulButton
          size="sm"
          state={pending ? "loading" : error ? "error" : result ? "success" : "idle"}
          icon={<GithubIcon />}
          loadingText="Waiting for Actions…"
          successText="Evidence ready"
          errorText="Try again"
          onClick={run}
        >
          Request validation
        </StatefulButton>
      </div>

      {error && <p className="px-6 py-4 text-sm text-destructive">{error}</p>}

      {result && (
        <div className="grid gap-px bg-border lg:grid-cols-[1fr_2fr]">
          <div className="flex flex-col gap-3 bg-card px-6 py-5 text-sm">
            <span className="inline-flex items-center gap-2 text-success">
              <ShieldCheck className="size-4" strokeWidth={1.5} />
              Workflow succeeded
            </span>
            <Field label="Request" value={result.requestId} />
            <Field label="Run" value={String(result.run.id)} />
            <Field label="Artifact" value={result.artifact.name} />
            <a
              href={result.run.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Open workflow run
              <ExternalLink className="size-3.5" strokeWidth={1.5} />
            </a>
          </div>
          <pre className="max-h-96 overflow-auto bg-background p-6 text-xs leading-relaxed text-foreground">
            {JSON.stringify(result.evidence, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}
