import "client-only";

export type RuntimePolicySlug = "bank-v1" | "enterprise-v1";

export type RuntimeJobStatus =
  | "queued"
  | "validating-source"
  | "persisting-private-evidence"
  | "starting-proof-server"
  | "syncing-wallet"
  | "checking-anchor-identity"
  | "anchoring"
  | "confirming-anchor"
  | "retrieving-merkle-path"
  | "proving-compliance"
  | "submitting"
  | "verifying-on-chain"
  | "verified"
  | "rejected"
  | "failed"
  | "cancelled";

export type RuntimeJobInput = {
  evidence: unknown;
  requestId: string;
  run: {
    id: number;
    url: string;
    status: string;
    conclusion: string | null;
  };
  artifact: {
    id: number;
    name: string;
  };
  policySlug: RuntimePolicySlug;
};

export type RuntimeJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RuntimeJobStatus;
  policySlug: RuntimePolicySlug;
  source: {
    repository: string;
    runId: number;
    runUrl: string;
    artifactDigest: string;
    commit: string;
  };
  anchor?: { txId: string; leafIndex: number };
  proof?: { txId: string; verdict: boolean };
  verification?: {
    txId: string;
    verdict: boolean;
    record: {
      policyVersion: string;
      provenAt: string;
      validUntil: string;
      compliant: boolean;
    };
  };
  error?: string;
};

type ErrorBody = { error?: string };

function origin(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("The runtime URL must be a loopback HTTP origin.");
  }
  if (parsed.origin !== value.trim().replace(/\/$/, "")) {
    throw new Error("The runtime URL must not contain a path, query, or fragment.");
  }
  return parsed.origin;
}

async function runtimeFetch<T>(
  runtimeUrl: string,
  pathname: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${origin(runtimeUrl)}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & ErrorBody;
  if (!response.ok) throw new Error(body.error ?? `Local runtime returned HTTP ${response.status}.`);
  return body;
}

export async function runtimeHealth(runtimeUrl: string): Promise<void> {
  await runtimeFetch(runtimeUrl, "/v1/health");
}

export async function pairRuntime(runtimeUrl: string, code: string): Promise<string> {
  const body = await runtimeFetch<{ token: string }>(runtimeUrl, "/v1/pair", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return body.token;
}

export async function createRuntimeJob(
  runtimeUrl: string,
  token: string,
  input: RuntimeJobInput,
): Promise<RuntimeJob> {
  const body = await runtimeFetch<{ job: RuntimeJob }>(
    runtimeUrl,
    "/v1/jobs",
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
  return body.job;
}

export async function getRuntimeJob(
  runtimeUrl: string,
  token: string,
  id: string,
): Promise<RuntimeJob> {
  const body = await runtimeFetch<{ job: RuntimeJob }>(runtimeUrl, `/v1/jobs/${id}`, {}, token);
  return body.job;
}
