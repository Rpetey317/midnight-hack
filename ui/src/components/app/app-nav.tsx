"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { LayoutGrid, LogOut, ScrollText, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Logo } from "./logo";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Tooltip } from "@/components/motion/tooltip";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Repositories", icon: LayoutGrid },
  { href: "/policies", label: "Policies", icon: ScrollText },
  { href: "/verify", label: "Verifier view", icon: ShieldCheck },
];

export function AppNav({ handle }: { handle: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;

  return (
    <header className="sticky top-0 z-40 border-b glass">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Logo href="/dashboard" />

        <nav className="flex items-center gap-0.5">
          {LINKS.map((link) => {
            const active =
              link.href === "/dashboard"
                ? pathname === "/dashboard" || pathname.startsWith("/attester")
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative isolate flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm transition-colors duration-150",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <link.icon className="size-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">{link.label}</span>
                {active && (
                  <motion.span
                    layoutId="app-nav-active"
                    transition={
                      reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }
                    }
                    className="absolute inset-0 -z-10 rounded-md bg-secondary"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">@{handle}</span>
          <ThemeToggle
            variant="circle-blur"
            className="text-muted-foreground hover:text-foreground"
          />
          <Tooltip content="Sign out" side="bottom">
            <button
              type="button"
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
        </div>
      </div>
    </header>
  );
}
