/**
 * Running external tools without letting them take the pipeline down.
 *
 * Every check in this package shells out to something — `npm audit`, `gh api`,
 * `npm ls` — and every one of those has a non-zero exit that is *not* a
 * failure. `npm audit` exits 1 when it finds vulnerabilities, which is the
 * normal case. `gh api` exits 1 on a 404, and a 404 from the branch-protection
 * endpoint is the answer "not protected", not an error.
 *
 * So `run()` never throws on a non-zero exit. It hands back the exit code and
 * lets the caller decide, which is the only way to tell those apart.
 */
import { execFile } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Set when the binary is missing, or the timeout fired. */
  failure?: string;
}

export interface RunOptions {
  cwd?: string;
  /** Milliseconds. Defaults to 30s; network checks pass something shorter. */
  timeout?: number;
  /** Some tools emit megabytes of JSON. npm ls --all in particular. */
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
}

export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 30_000,
        maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
        env: options.env ?? process.env,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          // ENOENT (binary missing) or ETIMEDOUT. A real failure to run, as
          // distinct from a tool that ran and reported something.
          resolve({
            code: -1,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            failure: error.message,
          });
          return;
        }
        resolve({
          code: typeof error?.code === 'number' ? error.code : 0,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        });
      },
    );
  });
}

/** `gh api <path>`, with the raw body returned regardless of status. */
export async function ghApi(
  apiPath: string,
  options: RunOptions = {},
): Promise<{ ok: boolean; status: number; body: unknown; result: RunResult }> {
  const result = await run('gh', ['api', apiPath], { timeout: 10_000, ...options });

  // gh prints the JSON error body to stdout even on a 4xx, so parse first and
  // read the status out of it rather than inferring from the exit code.
  let body: unknown = null;
  try {
    body = JSON.parse(result.stdout || result.stderr);
  } catch {
    body = null;
  }

  const status =
    body && typeof body === 'object' && 'status' in body
      ? Number((body as { status: unknown }).status)
      : result.code === 0
        ? 200
        : 0;

  return { ok: result.code === 0, status, body, result };
}

/** Parse JSON, returning null rather than throwing on a truncated tool dump. */
export function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** `fetch` with a timeout, so an unreachable host degrades in seconds. */
export async function fetchJson<T>(
  url: string,
  timeoutMs = 10_000,
): Promise<{ ok: boolean; body: T | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'zkuat-collector',
        // A token lifts the GitHub advisory rate limit from 60/hr to 5000/hr.
        // Absent is fine at demo scale.
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!response.ok) {
      return { ok: false, body: null, error: `HTTP ${response.status}` };
    }
    return { ok: true, body: (await response.json()) as T };
  } catch (err) {
    return { ok: false, body: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
