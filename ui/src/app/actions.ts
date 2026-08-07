"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EVIDENCE, POLICIES } from "@/lib/demo";

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function addProduct(_prev: unknown, formData: FormData) {
  const repo = String(formData.get("repo") ?? "").trim();
  if (!REPO_RE.test(repo)) {
    return { error: "Use the owner/name form, e.g. acme-corp/payments-api." };
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("products").insert({
    user_id: user.id,
    repo,
    github_login: user.user_metadata?.user_name ?? null,
  });

  if (error) {
    return {
      error:
        error.code === "23505" ? "That repository is already registered." : error.message,
    };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase } = await requireUser();
  await supabase.from("products").delete().eq("id", id);
  revalidatePath("/dashboard");
}

/** Seeds the demo repository, artifact and two proof records. Idempotent per user. */
export async function seedDemo() {
  const { supabase, user } = await requireUser();

  const { data: product, error } = await supabase
    .from("products")
    .upsert(
      {
        user_id: user.id,
        repo: EVIDENCE.repo,
        github_login: user.user_metadata?.user_name ?? null,
      },
      { onConflict: "user_id,repo" },
    )
    .select()
    .single();

  if (error || !product) return { error: error?.message ?? "Could not seed demo data." };

  const digest = EVIDENCE.artifactDigest.replace(/^sha256:/, "");
  const { data: artifact } = await supabase
    .from("artifacts")
    .upsert(
      {
        product_id: product.id,
        user_id: user.id,
        digest,
        commit_sha: EVIDENCE.commit,
        built_at: new Date(EVIDENCE.generatedAt * 1000).toISOString(),
        evidence_ref: "local:demo-bundle",
      },
      { onConflict: "product_id,digest" },
    )
    .select()
    .single();

  if (artifact) {
    const { data: existing } = await supabase
      .from("proof_activity")
      .select("id")
      .eq("artifact_id", artifact.id);

    if (!existing?.length) {
      await supabase.from("proof_activity").insert(
        POLICIES.map((p) => ({
          user_id: user.id,
          artifact_id: artifact.id,
          policy_id: p.slug,
          policy_version: p.version,
          verdict: true,
          record_key: null,
          tx_hash: null,
        })),
      );
    }
  }

  revalidatePath("/dashboard");
  return { ok: true, productId: product.id as string };
}

/** Records a proof result. The evidence itself is never sent here. */
export async function recordProof(input: {
  artifactId: string;
  policySlug: string;
  policyVersion: number;
  verdict: boolean;
  txHash: string;
}) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("proof_activity").insert({
    user_id: user.id,
    artifact_id: input.artifactId,
    policy_id: input.policySlug,
    policy_version: input.policyVersion,
    verdict: input.verdict,
    tx_hash: input.txHash,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
