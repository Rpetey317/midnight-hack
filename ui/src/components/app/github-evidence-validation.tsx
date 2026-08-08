"use client";

import { useState, useTransition } from "react";
import { Check, Cpu, ExternalLink, KeyRound, ShieldCheck, X } from "lucide-react";
import { StatefulButton } from "@/components/motion/button/stateful";
import { GithubIcon } from "@/components/app/github-icon";
import { requestRepositoryEvidence } from "@/app/actions";
import {
  createRuntimeJob,
  getRuntimeJob,
  pairRuntime,
  runtimeHealth,
  type RuntimeJob,
  type RuntimePolicySlug,
} from "@/lib/runtime";
import { shortDigest } from "@/lib/format";

type Result = Exclude<Awaited<ReturnType<typeof requestRepositoryEvidence>>, { error: string }>;

const TERMINAL = new Set(["verified", "rejected", "failed", "cancelled"]);
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
  const [policySlug, setPolicySlug] = useState<RuntimePolicySlug>("bank-v1");
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
      while (!TERMINAL.has(current.status)) {
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
                <KeyRound className="size-4" strokeWidth={1.5} />
                {runtimeToken ? "Paired" : "Pair runtime"}
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
                    <option value="bank-v1">Bank v1</option>
                    <option value="enterprise-v1">Enterprise v1</option>
                  </select>
                </label>
                <StatefulButton
                  state={runtimeBusy ? "loading" : runtimeError ? "error" : job && TERMINAL.has(job.status) ? "success" : "idle"}
                  icon={<Cpu className="size-4" strokeWidth={1.5} />}
                  loadingText="Proving locally…"
                  successText="Verified on chain"
                  errorText="Try again"
                  onClick={prove}
                  className="mt-auto"
                >
                  Generate proof
                </StatefulButton>
              </div>
            )}

            {runtimeError && <p className="mt-4 text-sm text-destructive">{runtimeError}</p>}

            {job && (
              <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {job.status === "verified" ? (
                    <Check className="size-4 text-success" strokeWidth={2} />
                  ) : job.status === "rejected" || job.status === "failed" ? (
                    <X className="size-4 text-destructive" strokeWidth={2} />
                  ) : (
                    <Cpu className="size-4 text-warning" strokeWidth={1.5} />
                  )}
                  {job.status.replaceAll("-", " ")}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">job {job.id}</p>
                {job.anchor && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    anchor tx {shortDigest(job.anchor.txId, 16, 10)}
                  </p>
                )}
                {job.proof && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    proof tx {shortDigest(job.proof.txId, 16, 10)}
                  </p>
                )}
                {job.verification && (
                  <p className={job.verification.record.compliant ? "mt-2 text-success" : "mt-2 text-destructive"}>
                    On-chain record: {job.verification.record.compliant ? "policy satisfied" : "policy not satisfied"}
                  </p>
                )}
              </div>
            )}
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
