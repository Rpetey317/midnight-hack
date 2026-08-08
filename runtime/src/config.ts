import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';

export type RuntimeNetwork = 'preview' | 'preprod';

const NETWORKS: Record<RuntimeNetwork, { indexer: string; indexerWS: string; node: string }> = {
  preview: {
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
  },
  preprod: {
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
  },
};

export interface RuntimeConfig {
  network: RuntimeNetwork;
  sponsorSeed: string;
  contractAddress: string | null;
  runtimeUrl: URL;
  bindHost: string;
  bindPort: number;
  allowedOrigins: string[];
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  proofServerImage: string;
  dockerNetwork: string | null;
  storageDir: string;
  envFile: string;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  envFile?: string;
  requireContract?: boolean;
}

function parseEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const result: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) throw new Error(`zkuat: invalid environment line in ${file}: ${rawLine}`);
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`zkuat: ${key} is required`);
  return value;
}

function sponsorSeedFromMnemonic(value: string): string {
  const mnemonic = value.trim().split(/\s+/).join(' ');
  if (mnemonic.split(' ').length !== 24 || !validateMnemonic(mnemonic, english)) {
    throw new Error(
      'zkuat: ZKUAT_SPONSOR_WALLET_SEED must be a valid 24-word English BIP-39 recovery phrase',
    );
  }
  return Buffer.from(mnemonicToSeedSync(mnemonic)).toString('hex');
}

function httpUrl(value: string, field: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`zkuat: ${field} must be an absolute URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`zkuat: ${field} must use http or https`);
  }
  return parsed;
}

function loopbackUrl(value: string, field: string): URL {
  const parsed = plainHttpOrigin(value, field);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`zkuat: ${field} must bind to a loopback address`);
  }
  return parsed;
}

function plainHttpOrigin(value: string, field: string): URL {
  const parsed = httpUrl(value, field);
  if (parsed.protocol !== 'http:') {
    throw new Error(`zkuat: ${field} must use http because the local service has no TLS listener`);
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`zkuat: ${field} must contain only an HTTP origin and optional port`);
  }
  return parsed;
}

function dockerNetworkName(value: string | undefined): string | null {
  const name = value?.trim();
  if (!name) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
    throw new Error('zkuat: ZKUAT_DOCKER_NETWORK is not a valid Docker network name');
  }
  return name;
}

function webOrigin(value: string, field: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`zkuat: ${field} must be an absolute origin`);
  }
  if (parsed.origin !== value.replace(/\/$/, '')) {
    throw new Error(`zkuat: ${field} must not contain a path, query, or fragment`);
  }
  return parsed.origin;
}

function webOrigins(env: Record<string, string | undefined>): string[] {
  const configured = env.ZKUAT_ALLOWED_ORIGINS?.trim();
  const values = configured
    ? configured.split(',').map((value) => value.trim())
    : [env.ZKUAT_ALLOWED_ORIGIN?.trim() || 'https://zkuat.works'];
  if (values.some((value) => !value)) {
    throw new Error('zkuat: ZKUAT_ALLOWED_ORIGINS must be a comma-separated list of origins');
  }
  return [...new Set(values.map((value) => webOrigin(value, 'ZKUAT_ALLOWED_ORIGINS')))];
}

export function loadConfig(options: LoadConfigOptions = {}): RuntimeConfig {
  const envFile = path.resolve(options.envFile ?? path.join(process.cwd(), '.env'));
  const fileEnv = parseEnvFile(envFile);
  const processEnv = options.env ?? process.env;
  const env: Record<string, string | undefined> = { ...fileEnv, ...processEnv };

  const networkValue = required(env, 'ZKUAT_NETWORK');
  if (networkValue !== 'preview' && networkValue !== 'preprod') {
    throw new Error('zkuat: ZKUAT_NETWORK must be preview or preprod');
  }
  const network = networkValue as RuntimeNetwork;

  const sponsorSeed = sponsorSeedFromMnemonic(required(env, 'ZKUAT_SPONSOR_WALLET_SEED'));

  const contractAddress = env.ZKUAT_CONTRACT_ADDRESS?.trim() || null;
  if (options.requireContract !== false && !contractAddress) {
    throw new Error('zkuat: ZKUAT_CONTRACT_ADDRESS is required');
  }
  if (contractAddress && !/^[0-9a-f]+$/i.test(contractAddress)) {
    throw new Error('zkuat: ZKUAT_CONTRACT_ADDRESS must be hexadecimal');
  }

  const runtimeUrl = loopbackUrl(
    env.ZKUAT_RUNTIME_URL?.trim() || 'http://127.0.0.1:4317',
    'ZKUAT_RUNTIME_URL',
  );
  const bindPort = Number(runtimeUrl.port || (runtimeUrl.protocol === 'https:' ? 443 : 80));
  if (!Number.isInteger(bindPort) || bindPort < 1 || bindPort > 65_535) {
    throw new Error('zkuat: ZKUAT_RUNTIME_URL has an invalid port');
  }

  const defaults = NETWORKS[network];
  const dockerNetwork = dockerNetworkName(env.ZKUAT_DOCKER_NETWORK);
  const proofServerUrl = dockerNetwork
    ? plainHttpOrigin(
        env.ZKUAT_PROOF_SERVER_URL?.trim() || 'http://zkuat-proof-server:6300',
        'ZKUAT_PROOF_SERVER_URL',
      )
    : loopbackUrl(
        env.ZKUAT_PROOF_SERVER_URL?.trim() || 'http://127.0.0.1:6300',
        'ZKUAT_PROOF_SERVER_URL',
      );
  if (dockerNetwork && proofServerUrl.hostname !== 'zkuat-proof-server') {
    throw new Error(
      'zkuat: ZKUAT_PROOF_SERVER_URL must use zkuat-proof-server on the Docker network',
    );
  }
  const proofServer = proofServerUrl.toString().replace(/\/$/, '');

  return {
    network,
    sponsorSeed,
    contractAddress,
    runtimeUrl,
    // A Compose port mapping publishes the runtime only on the host loopback,
    // while the process must listen on the container interface. Direct source
    // runs keep their loopback-only listener.
    bindHost: dockerNetwork
      ? '0.0.0.0'
      : runtimeUrl.hostname === 'localhost'
        ? '127.0.0.1'
        : runtimeUrl.hostname === '[::1]'
          ? '::1'
          : runtimeUrl.hostname,
    bindPort,
    allowedOrigins: webOrigins(env),
    indexer: env.ZKUAT_INDEXER_HTTP_URL?.trim() || defaults.indexer,
    indexerWS: env.ZKUAT_INDEXER_WS_URL?.trim() || defaults.indexerWS,
    node: env.ZKUAT_NODE_URL?.trim() || defaults.node,
    proofServer,
    proofServerImage:
      env.ZKUAT_PROOF_SERVER_IMAGE?.trim() || 'midnightntwrk/proof-server:8.1.0',
    dockerNetwork,
    storageDir: path.resolve(
      env.ZKUAT_STORAGE_DIR?.trim() || path.join(os.homedir(), '.zkuat', 'runtime'),
    ),
    envFile,
  };
}
