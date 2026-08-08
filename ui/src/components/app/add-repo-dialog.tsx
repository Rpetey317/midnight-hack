"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lock, Plus, Search } from "lucide-react";
import {
  CenterMorphModal,
  CenterMorphModalContent,
  CenterMorphModalTrigger,
} from "@/components/motion/center-morph-modal";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Loader } from "@/components/motion/loader";
import { addProduct, listGithubRepos } from "@/app/actions";
import { cn } from "@/lib/utils";

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
  const [query, setQuery] = useState("");

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

  // Every item stays mounted while the panel is closed (that is how Select keeps
  // its label registry), so an account with hundreds of repositories would mount
  // hundreds of nodes. Filter first, then cap what renders.
  const VISIBLE = 50;
  const { items, matchCount } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q));
    const shown = matches.slice(0, VISIBLE);
    // Unmounting the selected item would unregister its label and drop the
    // trigger back to the placeholder, so it always stays in the list.
    const selected = repos?.find((r) => r.fullName === repo);
    return {
      items:
        selected && !shown.some((r) => r.fullName === repo) ? [selected, ...shown] : shown,
      matchCount: matches.length,
    };
  }, [repos, query, repo]);

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
              placeholder="user-name/repo-name"
              autoFocus
              error={state && "error" in state ? state.error : undefined}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {/* An inline list rather than a dropdown: the morph modal clips
                  its own surface, so a panel long enough for hundreds of
                  repositories would be cut off inside it. */}
              <input type="hidden" name="repo" value={repo} />

              <Input
                label="Repository"
                value={query}
                onChange={setQuery}
                disabled={loading}
                placeholder={
                  loading ? "Loading repositories…" : `Search ${repos?.length ?? 0} repositories`
                }
                leftIcon={<Search className="size-4" strokeWidth={1.5} />}
                classNames={{ input: "font-mono" }}
              />

              {loading && (
                <span className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader variant="comet" size={14} />
                  Reading your GitHub account
                </span>
              )}

              {!loading && items.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
                  {items.map((r) => {
                    const active = r.fullName === repo;
                    return (
                      <button
                        key={r.fullName}
                        type="button"
                        onClick={() => setRepo(r.fullName)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 transition-colors",
                          active
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {r.fullName}
                        </span>
                        {r.private && (
                          <Lock className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                        )}
                        {active && <Check className="size-3.5 shrink-0 text-success" strokeWidth={2} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {!loading && matchCount > VISIBLE && (
                <span className="px-1 text-xs text-muted-foreground">
                  Showing {VISIBLE} of {matchCount} — keep typing to narrow it down.
                </span>
              )}
              {!loading && repos?.length !== 0 && matchCount === 0 && (
                <span className="px-1 text-xs text-muted-foreground">
                  No repository matches “{query.trim()}”.
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
