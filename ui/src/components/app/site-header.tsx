import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./logo";
import { GithubSignIn } from "./github-sign-in";
import { MobileDock } from "./mobile-dock";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { ButtonLink } from "@/components/motion/button/base";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/verify", label: "Verify" },
  { href: "/policies", label: "Policies" },
];

export function SiteHeader({
  signedIn = false,
  className,
}: {
  signedIn?: boolean;
  className?: string;
}) {
  return (
    <>
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b glass",
        className,
      )}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle variant="circle-blur" className="text-muted-foreground hover:text-foreground" />
          {signedIn ? (
            <>
              {/* The dock covers this route on mobile. */}
              <ButtonLink href="/dashboard" variant="secondary" size="sm" className="hidden sm:inline-flex">
                Dashboard
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
              </ButtonLink>
              <SignOutButton />
            </>
          ) : (
            <GithubSignIn size="sm" label="Sign in" />
          )}
        </div>
      </div>
    </header>

    <MobileDock signedIn={signedIn} />
    </>
  );
}
