import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-medium tracking-tight",
        "bg-[linear-gradient(135deg,#00dfe1_0%,#a672ff_100%)] text-[#0b0b0b]",
        className,
      )}
    >
      zk
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <span className="text-base font-semibold tracking-tight">zkuat</span>
    </Link>
  );
}
