#!/usr/bin/env -S npx tsx
import * as path from 'node:path';

import { ChainClient } from './chain/client.js';
import { loadConfig } from './config.js';
import { JobManager } from './jobs.js';
import { ProofServerManager } from './proof-server.js';
import { RuntimeServer } from './server.js';
import { ProcessLock } from './storage.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const lock = new ProcessLock(path.join(config.storageDir, 'runtime.lock'));
  lock.acquire();
  const proofServer = new ProofServerManager(
    config.proofServer,
    config.proofServerImage,
    config.dockerNetwork,
  );
  const chain = new ChainClient(config);
  const jobs = new JobManager(config.storageDir, proofServer, chain);
  const server = new RuntimeServer(config, jobs, proofServer, chain);

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await chain.stop().catch(() => undefined);
    lock.release();
  };
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));

  await server.listen();
  jobs.recover();
  // Write the startup banner directly to stdout. When this process is PID 1 in
  // the runtime image, Docker captures these lines verbatim in `docker logs`.
  process.stdout.write(
    [
      `zkuat runtime listening at ${config.runtimeUrl.toString().replace(/\/$/, '')}`,
      `PAIRING CODE: ${server.auth.code}`,
      `allowed origin: ${config.allowedOrigin}`,
      '',
    ].join('\n'),
  );
}

async function deploy(): Promise<void> {
  const config = loadConfig({ requireContract: false });
  const proofServer = new ProofServerManager(
    config.proofServer,
    config.proofServerImage,
    config.dockerNetwork,
  );
  await proofServer.start();
  const chain = new ChainClient(config);
  try {
    const result = await chain.deploy();
    console.log(`contract address: ${result.contractAddress}`);
    console.log(`policy transactions: ${result.policyTxIds.join(', ')}`);
    console.log('set ZKUAT_CONTRACT_ADDRESS to the contract address before starting the runtime');
  } finally {
    await chain.stop();
  }
}

async function proofServer(command: string): Promise<void> {
  const config = loadConfig({ requireContract: false });
  const manager = new ProofServerManager(
    config.proofServer,
    config.proofServerImage,
    config.dockerNetwork,
  );
  if (command === 'start') await manager.start();
  else if (command === 'stop') await manager.stop();
  else if (command !== 'status') throw new Error('usage: zkuat-runtime proof-server start|stop|status');
  console.log(JSON.stringify(await manager.status(), null, 2));
}

async function main(): Promise<void> {
  const [command = 'start', subcommand = 'status'] = process.argv.slice(2);
  if (command === 'start') return start();
  if (command === 'deploy') return deploy();
  if (command === 'proof-server') return proofServer(subcommand);
  throw new Error('usage: zkuat-runtime start|deploy|proof-server start|stop|status');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
