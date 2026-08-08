import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';

export type RuntimeNetwork = 'local' | 'preview' | 'preprod';

interface NetworkDefaults {
  /**
   * The identifier handed to the SDK's `setNetworkId`. It is not always the
   * configuration name: a local devnet answers to `undeployed`, which is also
   * what `midnightntwrk/indexer-standalone` is configured with in the
   * development compose stack.
   */
  networkId: string;
  indexer: string;
  indexerWS: string;
  node: string;
}

const NETWORKS: Record<RuntimeNetwork, NetworkDefaults> = {
  local: {
    networkId: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    node: 'http://127.0.0.1:9944',
  },
  preview: {
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
  },
  preprod: {
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
  },
};

const NETWORK_NAMES = Object.keys(NETWORKS) as RuntimeNetwork[];

export interface RuntimeConfig {
  network: RuntimeNetwork;
  networkId: string;
  sponsorSeed: string;
  contractAddress: string | null;
  runtimeUrl: URL;
  bindHost: string;
  bindPort: number;
  allowedOrigin: string;
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  proofServerImage: string;
  storageDir: string;
  envFile: string;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  envFile?: string;
  requireContract?: boolean;
  /**
   * Read-only commands (`ledger`) query the indexer and touch no wallet, so
   * they load a configuration with no sponsor seed at all. `sponsorSeed` is an
   * empty string in that case; anything that spends must not use it.
   */
  requireSeed?: boolean;
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

/**
 * Sponsor wallet seed → hex bytes for `HDWallet.fromSeed`.
 *
 * Every deployed network takes a 24-word recovery phrase and nothing else. A
 * local devnet additionally accepts a raw 32-byte hex seed, because its
 * genesis accounts are funded by seed rather than by phrase and there is no
 * phrase that restores them. Keeping the exception scoped to `local` means the
 * recovery-phrase requirement still holds everywhere a seed is worth stealing.
 */
function sponsorSeed(value: string, network: RuntimeNetwork): string {
  const raw = value.trim();
  if (network === 'local' && /^(?:0x)?[0-9a-f]{64}$/i.test(raw)) {
    return raw.replace(/^0x/i, '').toLowerCase();
  }
  const mnemonic = raw.split(/\s+/).join(' ');
  if (mnemonic.split(' ').length !== 24 || !validateMnemonic(mnemonic, english)) {
    throw new Error(
      network === 'local'
        ? 'zkuat: ZKUAT_SPONSOR_WALLET_SEED must be a valid 24-word English BIP-39 recovery phrase or a 64-character hexadecimal seed'
        : 'zkuat: ZKUAT_SPONSOR_WALLET_SEED must be a valid 24-word English BIP-39 recovery phrase',
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
  const parsed = httpUrl(value, field);
  if (parsed.protocol !== 'http:') {
    throw new Error(`zkuat: ${field} must use http because the local service has no TLS listener`);
  }
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`zkuat: ${field} must bind to a loopback address`);
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`zkuat: ${field} must contain only a loopback origin and optional port`);
  }
  return parsed;
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

export function loadConfig(options: LoadConfigOptions = {}): RuntimeConfig {
  const envFile = path.resolve(options.envFile ?? path.join(process.cwd(), '.env'));
  const fileEnv = parseEnvFile(envFile);
  const processEnv = options.env ?? process.env;
  const env: Record<string, string | undefined> = { ...fileEnv, ...processEnv };

  const networkValue = required(env, 'ZKUAT_NETWORK');
  if (!(NETWORK_NAMES as string[]).includes(networkValue)) {
    throw new Error(`zkuat: ZKUAT_NETWORK must be one of ${NETWORK_NAMES.join(', ')}`);
  }
  const network = networkValue as RuntimeNetwork;

  const seed =
    options.requireSeed === false
      ? ''
      : sponsorSeed(required(env, 'ZKUAT_SPONSOR_WALLET_SEED'), network);

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
  const proofServer = loopbackUrl(
    env.ZKUAT_PROOF_SERVER_URL?.trim() || 'http://127.0.0.1:6300',
    'ZKUAT_PROOF_SERVER_URL',
  ).toString().replace(/\/$/, '');

  return {
    network,
    networkId: defaults.networkId,
    sponsorSeed: seed,
    contractAddress,
    runtimeUrl,
    bindHost:
      runtimeUrl.hostname === 'localhost'
        ? '127.0.0.1'
        : runtimeUrl.hostname === '[::1]'
          ? '::1'
          : runtimeUrl.hostname,
    bindPort,
    allowedOrigin: webOrigin(
      env.ZKUAT_ALLOWED_ORIGIN?.trim() || 'https://zkuat.works',
      'ZKUAT_ALLOWED_ORIGIN',
    ),
    indexer: env.ZKUAT_INDEXER_HTTP_URL?.trim() || defaults.indexer,
    indexerWS: env.ZKUAT_INDEXER_WS_URL?.trim() || defaults.indexerWS,
    node: env.ZKUAT_NODE_URL?.trim() || defaults.node,
    proofServer,
    proofServerImage:
      env.ZKUAT_PROOF_SERVER_IMAGE?.trim() || 'midnightntwrk/proof-server:8.1.0',
    storageDir: path.resolve(
      env.ZKUAT_STORAGE_DIR?.trim() || path.join(os.homedir(), '.zkuat', 'runtime'),
    ),
    envFile,
  };
}
