"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  CenterMorphModal,
  CenterMorphModalContent,
  CenterMorphModalTrigger,
} from "@/components/motion/center-morph-modal";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { addProduct } from "@/app/actions";

export function AddRepoDialog({ label = "Add repository" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addProduct, null);

  useEffect(() => {
    if (state && "ok" in state && state.ok) setOpen(false);
  }, [state]);

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
          Only the repository name is stored. Evidence stays on your machine.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <Input
            name="repo"
            label="Repository"
            placeholder="acme-corp/payments-api"
            autoFocus
            error={state && "error" in state ? state.error : undefined}
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Adding…" : "Add repository"}
            </Button>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
