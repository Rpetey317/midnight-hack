"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuditsForRepo } from "@/lib/queries";
import { EVIDENCE, POLICIES } from "@/lib/demo";
import { retrieveGithubEvidence } from "@/lib/github/evidence";

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

const fakeHash = () =>
  `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;

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

/**
 * The signed-in user's GitHub repositories, minus the ones already registered.
 * Needs the OAuth provider token, which only exists on a fresh sign-in.
 */
export async function listGithubRepos() {
  const { supabase, user } = await requireUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.provider_token;
  if (!token) return { error: "GitHub access token not available. Sign out and sign in again." };

  const res = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) return { error: `GitHub API ${res.status} ${res.statusText}` };

  const repos = ((await res.json()) as { full_name: string; private: boolean }[]).map((r) => ({
    fullName: r.full_name,
    private: r.private,
  }));

  const { data: existing } = await supabase.from("products").select("repo").eq("user_id", user.id);
  const taken = new Set((existing ?? []).map((p) => p.repo as string));

  return { ok: true as const, repos: repos.filter((r) => !taken.has(r.fullName)) };
}

/** Public audit search by repository name. No session required. */
export async function findAuditsByRepo(repo: string) {
  const audits = await getAuditsForRepo(repo);
  return audits.map((a) => ({
    id: a.proof.id,
    repo: a.repo,
    policySlug: a.proof.policy_id,
    policyVersion: a.proof.policy_version,
    verdict: a.proof.verdict,
    commitSha: a.commitSha,
    createdAt: a.proof.created_at,
  }));
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
          // Seeded proofs carry a hash so the verifier's "check it yourself"
          // panel has every value a real proof would.
          tx_hash: fakeHash(),
        })),
      );
    }
  }

  revalidatePath("/dashboard");
  return { ok: true, productId: product.id as string };
}

export async function requestRepositoryEvidence(productId: string) {
  const { supabase, user } = await requireUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.provider_token;
  if (!token) {
    return { error: "GitHub access token not available. Sign out and sign in with GitHub again." };
  }

  const { data: product, error } = await supabase
    .from("products")
    .select("id,repo")
    .eq("id", productId)
    .eq("user_id", user.id)
    .single();

  if (error || !product) return { error: "Repository not found." };

  try {
    return { ok: true, ...(await retrieveGithubEvidence({ token, repository: product.repo })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not retrieve evidence." };
  }
}
