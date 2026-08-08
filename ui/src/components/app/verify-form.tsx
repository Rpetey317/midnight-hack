"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Loader } from "@/components/motion/loader";
import {
  CenterMorphModal,
  CenterMorphModalContent,
} from "@/components/motion/center-morph-modal";
import { findAuditsByRepo } from "@/app/actions";
import { UUID_RE, policyFor } from "@/lib/audit";
import { fmtDate, shortCommit } from "@/lib/format";

type Hit = Awaited<ReturnType<typeof findAuditsByRepo>>[number];

export function VerifyForm({
  defaultQuery = "",
  sampleRepo = "",
  sampleProofId = "",
}: {
  defaultQuery?: string;
  sampleRepo?: string;
  sampleProofId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);

  const submit = async () => {
    const value = query.trim();
    if (!value) {
      setError("Enter a repository name or a proof id.");
      return;
    }
    setError(undefined);

    // A proof id addresses one audit directly; anything else is a repo name.
    if (UUID_RE.test(value)) {
      router.push(`/verify/${value}`);
      return;
    }

    setBusy(true);
    const found = await findAuditsByRepo(value);
    setBusy(false);

    if (!found.length) {
      setError(`No audits recorded for “${value}”.`);
      return;
    }
    setHits(found);
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-6">
        <Input
          label="Repository or proof id"
          placeholder="user-name/repo-name  ·  8f3c1a20-…"
          value={query}
          onChange={setQuery}
          error={error}
          leftIcon={<Search className="size-4" strokeWidth={1.5} />}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          classNames={{ input: "font-mono" }}
        />

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            A proof id opens that audit. A repository name lists every audit run over it.
          </p>

          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            {/* TODO: demo affordance — drop before this is a real verifier. */}
            {sampleRepo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery(sampleRepo);
                  setError(undefined);
                }}
              >
                <span className="sm:hidden">Repo</span>
                <span className="hidden sm:inline">Sample repo</span>
              </Button>
            )}
            {sampleProofId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery(sampleProofId);
                  setError(undefined);
                }}
              >
                <span className="sm:hidden">Proof id</span>
                <span className="hidden sm:inline">Sample proof id</span>
              </Button>
            )}
            <Button onClick={submit} disabled={busy}>
              {busy ? "Searching…" : "Look up"}
              {busy && <Loader size={14} />}
            </Button>
          </div>
        </div>
      </div>

      <CenterMorphModal open={hits !== null} onOpenChange={(o) => !o && setHits(null)}>
        <CenterMorphModalContent
          ariaLabel="Audits for this repository"
          className="w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-glass-border bg-popover p-6 overlay-shadow"
        >
          <h2 className="text-lg font-medium tracking-tight">
            {hits?.[0]?.repo ?? query}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {hits?.length} audit{hits?.length === 1 ? "" : "s"} on record. Open one to see the
            verdict and the values you need to check it yourself.
          </p>

          <ul className="mt-5 max-h-80 overflow-y-auto overflow-x-hidden rounded-xl border border-border">
            {(hits ?? []).map((h) => (
              <li key={h.id} className="border-b border-border last:border-0">
                <Link
                  href={`/verify/${h.id}`}
                  onClick={() => setHits(null)}
                  className="group flex min-h-14 items-center gap-3 bg-card px-4 py-3 transition-colors duration-150 hover:bg-secondary"
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      h.verdict ? "bg-success" : "bg-destructive"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {policyFor(h.policySlug).name} v{h.policyVersion}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                      {h.commitSha ? shortCommit(h.commitSha) : "no commit"} ·{" "}
                      {fmtDate(Date.parse(h.createdAt) / 1000)}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                  />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setHits(null)}>
              Close
            </Button>
          </div>
        </CenterMorphModalContent>
      </CenterMorphModal>
    </>
  );
}
