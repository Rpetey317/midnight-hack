"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { StatefulButton } from "@/components/motion/button/stateful";
import type { ButtonVariant } from "@/components/motion/button/base";
import { seedDemo } from "@/app/actions";

export function SeedDemoButton({ variant = "secondary" }: { variant?: ButtonVariant }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <StatefulButton
      variant={variant}
      state={failed ? "error" : pending ? "loading" : "idle"}
      icon={<Sparkles className="size-4" strokeWidth={1.5} />}
      loadingText="Seeding…"
      errorText="Failed"
      onClick={() =>
        start(async () => {
          const res = await seedDemo();
          if (res?.error) setFailed(true);
          else router.refresh();
        })
      }
    >
      Load demo repository
    </StatefulButton>
  );
}
