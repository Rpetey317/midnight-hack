import { inflateRawSync } from "node:zlib";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RetrievedGithubEvidence = {
  evidence: JsonValue;
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
};

type GithubRepo = { owner: string; name: string };

type WorkflowRun = {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  display_title?: string;
  name?: string;
  event?: string;
};

type Artifact = {
  id: number;
  name: string;
  archive_download_url: string;
  expired: boolean;
};

const API = "https://api.github.com";
const DEFAULT_WORKFLOW = "attest.yml";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 4_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseRepo(repo: string): GithubRepo {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra) throw new Error(`Invalid GitHub repository "${repo}".`);
  return { owner, name };
}

async function github<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function download(token: string, url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) throw new Error(`GitHub artifact download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const min = Math.max(0, zip.length - 65_557);
  for (let i = zip.length - 22; i >= min; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("Artifact archive is not a readable ZIP file.");
}

function readZipEntry(zip: Buffer, fileName: string): Buffer {
  const eocd = findEndOfCentralDirectory(zip);
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Artifact archive has an invalid central directory.");
    }

    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (name === fileName) {
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error(`Artifact archive entry ${fileName} has an invalid local header.`);
      }
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = zip.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Artifact archive entry ${fileName} uses unsupported compression ${method}.`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`Artifact archive did not contain ${fileName}.`);
}

async function getDefaultBranch(token: string, repo: GithubRepo): Promise<string> {
  const res = await github<{ default_branch: string }>(token, `/repos/${repo.owner}/${repo.name}`);
  return res.default_branch;
}

function runMatches(run: WorkflowRun, requestId: string): boolean {
  return run.event === "workflow_dispatch" && [run.display_title, run.name].some((v) => v?.includes(requestId));
}

async function findRun(token: string, repo: GithubRepo, workflow: string, requestId: string) {
  const path = `/repos/${repo.owner}/${repo.name}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=30`;
  const res = await github<{ workflow_runs: WorkflowRun[] }>(token, path);
  return res.workflow_runs.find((run) => runMatches(run, requestId)) ?? null;
}

async function waitForRun(
  token: string,
  repo: GithubRepo,
  workflow: string,
  requestId: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let run: WorkflowRun | null = null;

  while (Date.now() < deadline) {
    run = await findRun(token, repo, workflow, requestId);
    if (run && run.status === "completed") return run;
    await sleep(POLL_MS);
  }

  throw new Error(run ? `Timed out waiting for workflow run ${run.id}.` : "Timed out waiting for dispatched workflow run.");
}

async function getEvidenceArtifact(token: string, repo: GithubRepo, runId: number, requestId: string) {
  const res = await github<{ artifacts: Artifact[] }>(
    token,
    `/repos/${repo.owner}/${repo.name}/actions/runs/${runId}/artifacts?per_page=100`,
  );
  // Must match `.github/workflows/attest.yml`'s upload step verbatim:
  //   name: zkuat-evidence-${{ inputs.request_id || github.sha }}
  // A mismatch here is not a soft failure — every retrieval throws
  // "did not produce artifact …" after waiting out the whole workflow run.
  const name = `zkuat-evidence-${requestId}`;
  const artifact = res.artifacts.find((item) => item.name === name);
  if (!artifact) throw new Error(`Workflow run ${runId} did not produce artifact ${name}.`);
  if (artifact.expired) throw new Error(`Workflow run ${runId} produced an expired artifact ${artifact.name}.`);
  return artifact;
}

export async function retrieveGithubEvidence({
  token,
  repository,
  ref,
  workflow = process.env.GITHUB_EVIDENCE_WORKFLOW ?? DEFAULT_WORKFLOW,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  token: string;
  repository: string;
  ref?: string;
  workflow?: string;
  timeoutMs?: number;
}): Promise<RetrievedGithubEvidence> {
  const repo = parseRepo(repository);
  const requestId = crypto.randomUUID();
  const targetRef = ref ?? (await getDefaultBranch(token, repo));

  await github<void>(token, `/repos/${repo.owner}/${repo.name}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: targetRef, inputs: { request_id: requestId } }),
  });

  const run = await waitForRun(token, repo, workflow, requestId, timeoutMs);
  if (run.conclusion !== "success") {
    throw new Error(`Workflow run ${run.id} completed with conclusion "${run.conclusion}".`);
  }

  const artifact = await getEvidenceArtifact(token, repo, run.id, requestId);
  const zip = await download(token, artifact.archive_download_url);
  const evidence = JSON.parse(readZipEntry(zip, "evidence.json").toString("utf8")) as JsonValue;

  return {
    evidence,
    requestId,
    run: {
      id: run.id,
      url: run.html_url,
      status: run.status,
      conclusion: run.conclusion,
    },
    artifact: {
      id: artifact.id,
      name: artifact.name,
    },
  };
}
