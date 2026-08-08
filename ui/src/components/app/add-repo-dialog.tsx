"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Lock, Plus } from "lucide-react";
import {
  CenterMorphModal,
  CenterMorphModalContent,
  CenterMorphModalTrigger,
} from "@/components/motion/center-morph-modal";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Loader } from "@/components/motion/loader";
import { addProduct, listGithubRepos } from "@/app/actions";

type Repo = { fullName: string; private: boolean };

export function AddRepoDialog({ label = "Add repository" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const submit = useCallback(async (previous: unknown, formData: FormData) => {
    const result = await addProduct(previous, formData);
    if ("ok" in result && result.ok) setOpen(false);
    return result;
  }, []);
  const [state, formAction, pending] = useActionState(submit, null);

  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repo, setRepo] = useState("");

  // Fetch on open, once. A failure falls back to typing the name by hand.
  useEffect(() => {
    if (!open || repos || loadError) return;
    let live = true;
    listGithubRepos().then((res) => {
      if (!live) return;
      if ("repos" in res && res.repos) setRepos(res.repos);
      else setLoadError("error" in res ? res.error : "Could not read your GitHub repositories.");
    });
    return () => {
      live = false;
    };
  }, [open, repos, loadError]);

  const loading = open && !repos && !loadError;

  return (
    <CenterMorphModal open={open} onOpenChange={setOpen}>
      <CenterMorphModalTrigger>
        <Button size="md">
          <Plus className="size-4" strokeWidth={1.5} />
          {label}
        </Button>
      </CenterMorphModalTrigger>

      <CenterMorphModalContent
        ariaLabel="Add a repository"
        className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-glass-border bg-popover p-6 overlay-shadow"
      >
        <h2 className="text-lg font-medium tracking-tight">Add a repository</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Only the repository name is stored. Findings are never written to Midnight.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          {loadError ? (
            <Input
              name="repo"
              label="Repository"
              placeholder="acme-corp/payments-api"
              autoFocus
              error={state && "error" in state ? state.error : undefined}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="px-1 text-sm font-medium text-foreground">Repository</span>
              <input type="hidden" name="repo" value={repo} />
              <Select value={repo} onValueChange={setRepo} disabled={loading}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={loading ? "Loading repositories…" : "Select a repository"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(repos ?? []).map((r) => (
                    <SelectItem key={r.fullName} value={r.fullName}>
                      {r.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loading && (
                <span className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader size={14} />
                  Reading your GitHub account
                </span>
              )}
              {repos?.length === 0 && (
                <span className="px-1 text-xs text-muted-foreground">
                  No repositories left to add. Anything already registered is hidden; if a
                  repository is missing, sign out and sign in again to re-grant GitHub access.
                </span>
              )}
              {state && "error" in state && (
                <span className="px-1 text-xs text-destructive">{state.error}</span>
              )}
              {repos?.find((r) => r.fullName === repo)?.private && (
                <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                  <Lock className="size-3" strokeWidth={1.5} />
                  Private repository — the name is stored, nothing else.
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || (!loadError && !repo)}>
              {pending ? "Adding…" : "Add repository"}
            </Button>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
