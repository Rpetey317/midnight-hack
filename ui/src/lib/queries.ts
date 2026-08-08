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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { products: [], artifacts: [], proofs: [] };

  // artifacts and proof_activity are publicly readable — scope them to the owner here.
  const [{ data: products }, { data: artifacts }, { data: proofs }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("artifacts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("proof_activity")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    products: (products ?? []) as ProductRow[],
    artifacts: (artifacts ?? []) as ArtifactRow[],
    proofs: (proofs ?? []) as ProofRow[],
  };
}

export type PublicAudit = {
  proof: ProofRow;
  repo: string;
  digest: string;
  commitSha: string | null;
  builtAt: string | null;
};

// An audit is only meaningful to a verifier alongside what it was run over, so
// every public read walks proof → artifact → product in one embedded select.
const AUDIT_SELECT = "*, artifacts(digest,commit_sha,built_at,products(repo))";

type AuditJoin = ProofRow & {
  artifacts: {
    digest: string;
    commit_sha: string | null;
    built_at: string | null;
    products: { repo: string } | null;
  } | null;
};

function toAudit(row: AuditJoin): PublicAudit {
  const { artifacts, ...proof } = row;
  return {
    proof: proof as ProofRow,
    repo: artifacts?.products?.repo ?? "",
    digest: artifacts?.digest ?? "",
    commitSha: artifacts?.commit_sha ?? null,
    builtAt: artifacts?.built_at ?? null,
  };
}

/** One audit by its id. Public ledger state — resolves without a session. */
export async function getAudit(id: string): Promise<PublicAudit | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proof_activity")
    .select(AUDIT_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toAudit(data as AuditJoin) : null;
}

/** The most recent audits across everyone. Public ledger state. */
export async function getRecentAudits(limit = 5): Promise<PublicAudit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proof_activity")
    .select(AUDIT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as AuditJoin[]).map(toAudit);
}

/**
 * Every audit run over a repository, newest first. Matches case-insensitively
 * and on the bare name too, so `payments-api` finds `acme-corp/payments-api`.
 */
export async function getAuditsForRepo(repo: string): Promise<PublicAudit[]> {
  const term = repo.trim();
  if (!term) return [];

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id")
    .or(`repo.ilike.${term},repo.ilike.%/${term}`);
  if (!products?.length) return [];

  const { data: artifacts } = await supabase
    .from("artifacts")
    .select("id")
    .in(
      "product_id",
      products.map((p) => p.id as string),
    );
  if (!artifacts?.length) return [];

  const { data } = await supabase
    .from("proof_activity")
    .select(AUDIT_SELECT)
    .in(
      "artifact_id",
      artifacts.map((a) => a.id as string),
    )
    .order("created_at", { ascending: false });

  return ((data ?? []) as AuditJoin[]).map(toAudit);
}

/** Every audit recorded for an artifact digest, newest first. Public. */
export async function getAuditsForDigest(digest: string): Promise<PublicAudit[]> {
  const supabase = await createClient();
  const { data: artifacts } = await supabase.from("artifacts").select("id").eq("digest", digest);
  if (!artifacts?.length) return [];

  const { data } = await supabase
    .from("proof_activity")
    .select(AUDIT_SELECT)
    .in(
      "artifact_id",
      artifacts.map((a) => a.id as string),
    )
    .order("created_at", { ascending: false });

  return ((data ?? []) as AuditJoin[]).map(toAudit);
}

export async function getProduct(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: product } = await supabase.from("products").select("*").eq("id", id).single();
  if (!product) return null;

  const [{ data: artifacts }, { data: proofs }] = await Promise.all([
    supabase
      .from("artifacts")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("proof_activity")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const list = (artifacts ?? []) as ArtifactRow[];
  const ids = new Set(list.map((a) => a.id));

  return {
    product: product as ProductRow,
    artifacts: list,
    proofs: ((proofs ?? []) as ProofRow[]).filter((p) => ids.has(p.artifact_id)),
  };
}
