"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { shortCommit, shortDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ArtifactPicker({
  productId,
  artifacts,
  selected,
  className,
}: {
  productId: string;
  artifacts: { digest: string; commit: string | null; builtAt: string | null }[];
  selected: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Proven build</span>
      <Tabs
        value={selected}
        onValueChange={(v) => router.push(`/attester/${productId}?artifact=${v}`)}
        variant="segment"
      >
        <TabsList className="w-full overflow-x-auto">
          {artifacts.map((a) => (
            <TabsTrigger key={a.digest} value={a.digest} className="whitespace-nowrap font-mono">
              {/* The commit is what a developer recognises; the digest disambiguates. */}
              {a.commit ? `${shortCommit(a.commit)} · ` : ""}
              {shortDigest(a.digest, 6, 4)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
