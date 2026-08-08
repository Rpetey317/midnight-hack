"use client";

import { useState, useTransition } from "react";
import { Cpu, ExternalLink, KeyRound, ShieldCheck, Terminal } from "lucide-react";
import { StatefulButton } from "@/components/motion/button/stateful";
import { GithubIcon } from "@/components/app/github-icon";
import { CopyField } from "@/components/app/copy-field";
import { RuntimeProgress } from "@/components/app/runtime-progress";
import { Loader } from "@/components/motion/loader";
import { requestRepositoryEvidence } from "@/app/actions";
import {
  createRuntimeJob,
  getRuntimeJob,
  isTerminalStatus,
  pairRuntime,
  runtimeHealth,
  type RuntimeJob,
  type RuntimePolicySlug,
} from "@/lib/runtime";

type Result = Exclude<Awaited<ReturnType<typeof requestRepositoryEvidence>>, { error: string }>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function GithubEvidenceValidation({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [runtimeUrl, setRuntimeUrl] = useState("http://127.0.0.1:4317");
  const [pairingCode, setPairingCode] = useState("");
  const [runtimeToken, setRuntimeToken] = useState<string | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [policySlug, setPolicySlug] = useState<RuntimePolicySlug>("npm-ci-baseline-v1");
  const [job, setJob] = useState<RuntimeJob | null>(null);

  const retrieve = () => {
    setError(null);
    setJob(null);
    startTransition(async () => {
      const next = await requestRepositoryEvidence(productId);
      if ("error" in next) {
        setError(next.error ?? "Could not retrieve evidence.");
        return;
      }
      setResult(next);
    });
  };

  const pair = async () => {
    setRuntimeBusy(true);
    setRuntimeError(null);
    try {
      await runtimeHealth(runtimeUrl);
      setRuntimeToken(await pairRuntime(runtimeUrl, pairingCode));
      setPairingCode("");
    } catch (next) {
      setRuntimeToken(null);
      setRuntimeError(next instanceof Error ? next.message : "Could not pair with the runtime.");
    } finally {
      setRuntimeBusy(false);
    }
  };

  const prove = async () => {
    if (!result || !runtimeToken) return;
    setRuntimeBusy(true);
    setRuntimeError(null);
    setJob(null);
    try {
      let current = await createRuntimeJob(runtimeUrl, runtimeToken, {
        evidence: result.evidence,
        requestId: result.requestId,
        run: result.run,
        artifact: result.artifact,
        policySlug,
      });
      setJob(current);
      while (!isTerminalStatus(current.status)) {
        await sleep(1_500);
        current = await getRuntimeJob(runtimeUrl, runtimeToken, current.id);
        setJob(current);
      }
      if (current.status === "failed" || current.status === "cancelled") {
        throw new Error(current.error ?? `Runtime job ended as ${current.status}.`);
      }
    } catch (next) {
      setRuntimeError(next instanceof Error ? next.message : "The local proof failed.");
    } finally {
      setRuntimeBusy(false);
    }
  };

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
      {/* Proving needs the companion running locally; once paired, this is noise. */}
      {!runtimeToken && (
        <div className="border-b border-border bg-background px-6 py-5">
          <div className="flex items-start gap-3">
            <Terminal className="size-4 shrink-0 text-warning" strokeWidth={1.5} />
            <div className="min-w-0">
              <h2 className="text-sm font-medium tracking-tight">Start the local runtime first</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Proving runs on your machine, not here. Start the companion from the
                repository root and leave it attached — its output prints{" "}
                <code className="rounded bg-card px-1 py-0.5 font-mono text-[11px] text-foreground">
                  PAIRING CODE: 123456
                </code>
                . Enter that code below once the evidence is ready.
              </p>
            </div>
          </div>
          <CopyField
            label="Repository root"
            value="docker compose up"
            className="mt-3 sm:pl-7"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-sm font-medium tracking-tight">GitHub evidence and local proof</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Retrieve evidence through GitHub, then prove it with your paired local runtime.
          </p>
        </div>
        <StatefulButton
          size="sm"
          state={pending ? "loading" : error ? "error" : result ? "success" : "idle"}
          icon={<GithubIcon />}
          loadingText="Waiting for Actions…"
          successText="Evidence ready"
          errorText="Try again"
          onClick={retrieve}
        >
          Request validation
        </StatefulButton>
      </div>

      {error && <p className="px-6 py-4 text-sm text-destructive">{error}</p>}

      {result && (
        <>
          <div className="grid gap-px bg-border lg:grid-cols-[1fr_2fr]">
            <div className="flex flex-col gap-3 bg-card px-6 py-5 text-sm">
              <span className="inline-flex items-center gap-2 text-success">
                <ShieldCheck className="size-4" strokeWidth={1.5} />
                Evidence ready
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

          <div className="border-t border-border px-6 py-5">
            <div className="grid gap-3 md:grid-cols-[1fr_9rem_auto]">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Local runtime URL
                <input
                  value={runtimeUrl}
                  onChange={(event) => {
                    setRuntimeUrl(event.target.value);
                    setRuntimeToken(null);
                  }}
                  disabled={runtimeBusy}
                  className="h-9 rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus:border-foreground/40"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Pairing code
                <input
                  value={pairingCode}
                  onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  disabled={runtimeBusy || Boolean(runtimeToken)}
                  className="h-9 rounded-lg border border-border bg-background px-3 font-mono text-xs tracking-widest text-foreground outline-none focus:border-foreground/40"
                />
              </label>
              <button
                type="button"
                onClick={pair}
                disabled={runtimeBusy || pairingCode.length !== 6 || Boolean(runtimeToken)}
                className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 text-sm text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runtimeBusy && !runtimeToken ? (
                  <Loader variant="comet" size={16} speed={0.9} label="Pairing" />
                ) : (
                  <KeyRound className="size-4" strokeWidth={1.5} />
                )}
                {runtimeToken ? "Paired" : runtimeBusy ? "Pairing…" : "Pair runtime"}
              </button>
            </div>

            {runtimeToken && (
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Policy
                  <select
                    value={policySlug}
                    onChange={(event) => setPolicySlug(event.target.value as RuntimePolicySlug)}
                    disabled={runtimeBusy}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground/40"
                  >
                    <option value="npm-ci-baseline-v1">npm CI Baseline v1</option>
                    <option value="npm-production-release-v1">npm Production Release v1</option>
                    <option value="npm-zero-known-vulns-v1">npm Zero Known Vulnerabilities v1</option>
                    <option value="npm-emergency-hotfix-v1">npm Emergency Hotfix v1</option>
                  </select>
                </label>
                <StatefulButton
                  state={runtimeBusy ? "loading" : runtimeError ? "error" : job && isTerminalStatus(job.status) ? "success" : "idle"}
                  icon={<Cpu className="size-4" strokeWidth={1.5} />}
                  loadingText="Proving locally…"
                  successText="Run complete"
                  errorText="Try again"
                  onClick={prove}
                  className="mt-auto"
                >
                  Generate proof
                </StatefulButton>
              </div>
            )}

            {runtimeError && <p className="mt-4 text-sm text-destructive">{runtimeError}</p>}

            {job && <RuntimeProgress job={job} />}
          </div>
        </>
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
