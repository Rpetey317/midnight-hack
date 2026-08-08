"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ScrollText, ShieldCheck } from "lucide-react";
import { Dock, DockItem } from "@/components/motion/dock";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Home };

const PUBLIC: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/verify", label: "Verify", icon: ShieldCheck },
  { href: "/policies", label: "Policies", icon: ScrollText },
];

// A signed-in user's home *is* the dashboard, and the verifier view is the
// public read side — neither belongs here.
const SIGNED_IN: Item[] = [
  { href: "/dashboard", label: "Repos", icon: LayoutGrid },
  { href: "/policies", label: "Policies", icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/attester");
  return pathname.startsWith(href);
}

/**
 * Primary navigation below the thumb on small screens. The header keeps the
 * logo, the theme toggle and the session action; its links are hidden here.
 */
export function MobileDock({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  const items = signedIn ? SIGNED_IN : PUBLIC;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      <Dock className="pointer-events-auto bg-card/90">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <DockItem key={item.href} active={active}>
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex size-full flex-col items-center justify-center gap-0.5 rounded-xl outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-[18px]" strokeWidth={1.5} />
                <span className="text-[10px] leading-none">{item.label}</span>
              </Link>
            </DockItem>
          );
        })}
      </Dock>
    </div>
  );
}
