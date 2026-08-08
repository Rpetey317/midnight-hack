import * as http from 'node:http';

import { PairingAuth } from './auth.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeJobInput } from './evidence.js';
import type { JobManager, PublicJob } from './jobs.js';
import type { ProofServerManager } from './proof-server.js';
import type { ChainClient } from './chain/client.js';

const MAX_BODY = 1_000_000;

async function jsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY) throw new Error('zkuat: request body exceeds 1 MB');
    chunks.push(bytes);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('zkuat: request body is not valid JSON');
  }
}

function send(response: http.ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(body)}\n`);
}

export class RuntimeServer {
  readonly auth: PairingAuth;
  private readonly server: http.Server;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly jobs: JobManager,
    private readonly proofServer: ProofServerManager,
    private readonly chain: ChainClient,
    pairingCode?: string,
  ) {
    this.auth = new PairingAuth(pairingCode);
    this.server = http.createServer((request, response) => {
      void this.route(request, response);
    });
  }

  private cors(request: http.IncomingMessage, response: http.ServerResponse): boolean {
    const origin = request.headers.origin;
    if (origin && origin !== this.config.allowedOrigin) {
      send(response, 403, { error: 'origin is not allowed' });
      return false;
    }
    if (origin) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'Origin');
    }
    response.setHeader('access-control-allow-private-network', 'true');
    response.setHeader('access-control-allow-headers', 'authorization, content-type');
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    return true;
  }

  private authorized(request: http.IncomingMessage, response: http.ServerResponse): boolean {
    if (this.auth.accepts(request.headers.authorization)) return true;
    send(response, 401, { error: 'pair with the local runtime first' });
    return false;
  }

  private async route(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      if (!this.cors(request, response)) return;
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }
      const url = new URL(request.url ?? '/', this.config.runtimeUrl);

      if (request.method === 'GET' && url.pathname === '/v1/health') {
        send(response, 200, {
          ok: true,
          network: this.config.network,
          contractConfigured: Boolean(this.config.contractAddress),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pair') {
        const body = (await jsonBody(request)) as { code?: unknown };
        if (typeof body.code !== 'string') throw new Error('zkuat: pairing code is required');
        send(response, 200, { token: this.auth.pair(body.code) });
        return;
      }

      if (!this.authorized(request, response)) return;

      if (request.method === 'GET' && url.pathname === '/v1/jobs') {
        send(response, 200, { jobs: this.jobs.list() });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/jobs') {
        const job = this.jobs.create((await jsonBody(request)) as RuntimeJobInput);
        send(response, 202, { job });
        return;
      }

      const jobMatch = url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]{36})$/i);
      if (request.method === 'GET' && jobMatch) {
        const job = this.jobs.get(jobMatch[1]!);
        send(response, job ? 200 : 404, job ? { job } : { error: 'job not found' });
        return;
      }

      const cancelMatch = url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]{36})\/cancel$/i);
      if (request.method === 'POST' && cancelMatch) {
        const job = this.jobs.cancel(cancelMatch[1]!);
        send(response, job ? 200 : 404, job ? { job } : { error: 'job not found' });
        return;
      }

      const eventsMatch = url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]{36})\/events$/i);
      if (request.method === 'GET' && eventsMatch) {
        const id = eventsMatch[1]!;
        const current = this.jobs.get(id);
        if (!current) {
          send(response, 404, { error: 'job not found' });
          return;
        }
        response.statusCode = 200;
        response.setHeader('content-type', 'text/event-stream');
        response.setHeader('cache-control', 'no-cache');
        response.setHeader('connection', 'keep-alive');
        response.flushHeaders();
        const write = (job: PublicJob) => response.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
        write(current);
        const listener = (job: PublicJob) => write(job);
        this.jobs.on(`job:${id}`, listener);
        const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
        request.on('close', () => {
          clearInterval(keepAlive);
          this.jobs.off(`job:${id}`, listener);
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/proof-server/start') {
        await this.proofServer.start();
        send(response, 200, { status: await this.proofServer.status() });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/proof-server/stop') {
        await this.proofServer.stop();
        send(response, 200, { status: await this.proofServer.status() });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/proof-server/status') {
        send(response, 200, { status: await this.proofServer.status() });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/wallet/status') {
        send(response, 200, { status: await this.chain.status() });
        return;
      }

      send(response, 404, { error: 'not found' });
    } catch (error: unknown) {
      send(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.bindPort, this.config.bindHost, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
