import { createClient } from "./supabase/server";

export type ProductRow = {
  id: string;
  user_id: string;
  repo: string;
  github_login: string | null;
  created_at: string;
};

export type ArtifactRow = {
  id: string;
  product_id: string;
  user_id: string;
  digest: string;
  commit_sha: string | null;
  built_at: string | null;
  evidence_ref: string | null;
  created_at: string;
};

export type ProofRow = {
  id: string;
  user_id: string;
  artifact_id: string;
  policy_id: string;
  policy_version: number;
  verdict: boolean;
  record_key: string | null;
  tx_hash: string | null;
  created_at: string;
};

export async function getWorkspace() {
  const supabase = await createClient();
  const [{ data: products }, { data: artifacts }, { data: proofs }] = await Promise.all([
    supabase.from("products").select("*").order("created_at", { ascending: true }),
    supabase.from("artifacts").select("*").order("created_at", { ascending: false }),
    supabase.from("proof_activity").select("*").order("created_at", { ascending: false }),
  ]);

  return {
    products: (products ?? []) as ProductRow[],
    artifacts: (artifacts ?? []) as ArtifactRow[],
    proofs: (proofs ?? []) as ProofRow[],
  };
}

export async function getProduct(id: string) {
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("*").eq("id", id).single();
  if (!product) return null;

  const [{ data: artifacts }, { data: proofs }] = await Promise.all([
    supabase
      .from("artifacts")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("proof_activity").select("*").order("created_at", { ascending: false }),
  ]);

  const list = (artifacts ?? []) as ArtifactRow[];
  const ids = new Set(list.map((a) => a.id));

  return {
    product: product as ProductRow,
    artifacts: list,
    proofs: ((proofs ?? []) as ProofRow[]).filter((p) => ids.has(p.artifact_id)),
  };
}
