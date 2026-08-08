"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Tooltip } from "@/components/motion/tooltip";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Tooltip content="Sign out" side="bottom">
      <button
        type="button"
        aria-label="Sign out"
        onClick={async () => {
          await createClient().auth.signOut();
          router.replace("/");
          router.refresh();
        }}
        className="grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogOut className="size-4" strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}
