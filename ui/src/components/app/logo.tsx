import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Kept byte-identical to `src/app/icon.svg`, so the tab and the header carry
 * the same mark. The gradient id is fixed rather than generated: every instance
 * paints the same gradient, so duplicates across the page resolve to the same
 * paint and there is nothing to collide over.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      className={cn("size-7 shrink-0", className)}
    >
      <defs>
        <linearGradient id="zkuat-mark" x1="5" y1="23" x2="27" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00dfe1" />
          <stop offset="1" stopColor="#a672ff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="#0b0b0b" />
      <g fill="url(#zkuat-mark)">
        <rect x="4.3" y="11.9" width="5" height="5" rx="1.6" />
        <rect x="7.9" y="15.5" width="5" height="5" rx="1.6" />
        <rect x="11.5" y="19.1" width="5" height="5" rx="1.6" />
        <rect x="15.3" y="15.3" width="5" height="5" rx="1.6" />
        <rect x="19.1" y="11.5" width="5" height="5" rx="1.6" />
        <rect x="22.9" y="7.7" width="5" height="5" rx="1.6" />
      </g>
    </svg>
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
      <LogoMark />
      <span className="text-base font-semibold tracking-tight">zkuat</span>
    </Link>
  );
}
