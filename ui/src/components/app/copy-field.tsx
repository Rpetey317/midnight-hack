"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function legacyCopy(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    el.remove();
  }
}

/**
 * A labelled value the verifier can lift out verbatim — repo, commit, proof
 * hash — so they can go re-derive the proof themselves.
 */
export function CopyField({
  label,
  value,
  display,
  className,
}: {
  label: string;
  value: string;
  display?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    // The async clipboard is denied outside secure/focused contexts; the
    // selection-based path still works there, so try it before giving up.
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = legacyCopy(value);
    }
    if (!ok) return;

    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={copy}
        disabled={!value}
        aria-label={`Copy ${label}`}
        className={cn(
          "group flex min-h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-left outline-none",
          "transition-colors duration-150 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums">
          {value ? (display ?? value) : "—"}
        </span>
        {copied ? (
          <Check className="size-3.5 shrink-0 text-success" strokeWidth={2} />
        ) : (
          <Copy
            className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            strokeWidth={1.5}
          />
        )}
      </button>
    </div>
  );
}
