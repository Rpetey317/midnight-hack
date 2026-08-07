"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { POLICIES } from "@/lib/demo";

export function VerifyForm({ defaultDigest = "" }: { defaultDigest?: string }) {
  const router = useRouter();
  const [digest, setDigest] = useState(defaultDigest);
  const [policy, setPolicy] = useState(POLICIES[0].slug);
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    const d = digest.trim().replace(/^sha256:/, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(d)) {
      setError("Expected a 64-character hex sha256 digest.");
      return;
    }
    setError(undefined);
    router.push(`/verify/${d}?policy=${policy}`);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <Input
          label="Artifact digest"
          placeholder="sha256:3d8f21a9…"
          value={digest}
          onChange={setDigest}
          error={error}
          leftIcon={<Search className="size-4" strokeWidth={1.5} />}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          classNames={{ input: "font-mono" }}
        />
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-sm font-medium text-foreground">Policy</span>
          <Select value={policy} onValueChange={setPolicy}>
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="Select a policy" />
            </SelectTrigger>
            <SelectContent>
              {POLICIES.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {`${p.name} v${p.version}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end">
        <Button onClick={submit}>Check compliance</Button>
      </div>
    </div>
  );
}
