"use client";

import { useState } from "react";
import { GithubIcon } from "./github-icon";
import { StatefulButton } from "@/components/motion/button/stateful";
import type { ButtonSize, ButtonVariant } from "@/components/motion/button/base";
import { createClient } from "@/lib/supabase/client";

export function GithubSignIn({
  variant = "primary",
  size = "md",
  label = "Sign in with GitHub",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  return (
    <StatefulButton
      variant={variant}
      size={size}
      className={className}
      state={state}
      icon={<GithubIcon />}
      loadingText="Redirecting…"
      errorText="Try again"
      onClick={async () => {
        setState("loading");
        const { error } = await createClient().auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: `${location.origin}/auth/callback`,
            // `repo` lists private repositories and dispatches the evidence workflow.
            scopes: "read:user repo workflow",
          },
        });
        if (error) setState("error");
      }}
    >
      {label}
    </StatefulButton>
  );
}
