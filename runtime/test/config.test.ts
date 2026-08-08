import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const recoveryPhrase = `${'abandon '.repeat(23)}art`;

const baseEnv = {
  ZKUAT_NETWORK: 'preview',
  ZKUAT_SPONSOR_WALLET_SEED: recoveryPhrase,
  ZKUAT_CONTRACT_ADDRESS: 'ab'.repeat(32),
};

describe('loadConfig', () => {
  it('looks for the default env file in the runtime directory', () => {
    const config = loadConfig({ env: baseEnv });
    expect(config.envFile).toBe(path.resolve('.env'));
  });

  it('uses one runtime URL for host and port', () => {
    const config = loadConfig({
      env: { ...baseEnv, ZKUAT_RUNTIME_URL: 'http://127.0.0.1:9876' },
      envFile: '/does/not/exist',
    });
    expect(config.bindHost).toBe('127.0.0.1');
    expect(config.bindPort).toBe(9876);
  });

  it('loads the default public network endpoints and local proof server', () => {
    const config = loadConfig({ env: baseEnv, envFile: '/does/not/exist' });
    expect(config.indexer).toContain('indexer.preview.midnight.network');
    expect(config.proofServer).toBe('http://127.0.0.1:6300');
    expect(config.dockerNetwork).toBeNull();
  });

  it('uses the private Compose network inside the runtime container', () => {
    const config = loadConfig({
      env: {
        ...baseEnv,
        ZKUAT_DOCKER_NETWORK: 'zkuat-runtime',
        ZKUAT_PROOF_SERVER_URL: 'http://zkuat-proof-server:6300',
      },
      envFile: '/does/not/exist',
    });
    expect(config.bindHost).toBe('0.0.0.0');
    expect(config.runtimeUrl.origin).toBe('http://127.0.0.1:4317');
    expect(config.proofServer).toBe('http://zkuat-proof-server:6300');
    expect(config.dockerNetwork).toBe('zkuat-runtime');
  });

  it('rejects a different proof-server host on the private Docker network', () => {
    expect(() =>
      loadConfig({
        env: {
          ...baseEnv,
          ZKUAT_DOCKER_NETWORK: 'zkuat-runtime',
          ZKUAT_PROOF_SERVER_URL: 'http://example.com:6300',
        },
        envFile: '/does/not/exist',
      }),
    ).toThrow('must use zkuat-proof-server');
  });

  it('rejects a non-loopback runtime URL', () => {
    expect(() =>
      loadConfig({
        env: { ...baseEnv, ZKUAT_RUNTIME_URL: 'http://0.0.0.0:4317' },
        envFile: '/does/not/exist',
      }),
    ).toThrow('loopback');
  });

  it('rejects a runtime URL that the HTTP listener cannot serve exactly', () => {
    expect(() =>
      loadConfig({
        env: { ...baseEnv, ZKUAT_RUNTIME_URL: 'https://127.0.0.1:4317/v1' },
        envFile: '/does/not/exist',
      }),
    ).toThrow('must use http');
  });

  it('loads values from the private env file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zkuat-config-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(
      file,
      `ZKUAT_NETWORK=preprod\nZKUAT_SPONSOR_WALLET_SEED="${recoveryPhrase}"\nZKUAT_CONTRACT_ADDRESS=${'cd'.repeat(32)}\n`,
    );
    const config = loadConfig({ env: {}, envFile: file });
    expect(config.network).toBe('preprod');
    expect(config.sponsorSeed).toBe(
      '408b285c123836004f4b8842c89324c1f01382450c0d439af345ba7fc49acf705' +
        '489c6fc77dbd4e3dc1dd8cc6bc9f043db8ada1e243c4a0eafb290d399480840',
    );
  });

  it('normalizes whitespace in the recovery phrase', () => {
    const config = loadConfig({
      env: {
        ...baseEnv,
        ZKUAT_SPONSOR_WALLET_SEED: `  ${recoveryPhrase.replaceAll(' ', '   ')}  `,
      },
      envFile: '/does/not/exist',
    });
    expect(config.sponsorSeed).toBe(
      '408b285c123836004f4b8842c89324c1f01382450c0d439af345ba7fc49acf705' +
        '489c6fc77dbd4e3dc1dd8cc6bc9f043db8ada1e243c4a0eafb290d399480840',
    );
  });

  it('rejects a recovery phrase with fewer than 24 words', () => {
    expect(() =>
      loadConfig({
        env: {
          ...baseEnv,
          ZKUAT_SPONSOR_WALLET_SEED:
            'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        },
        envFile: '/does/not/exist',
      }),
    ).toThrow('24-word English BIP-39 recovery phrase');
  });

  it('rejects a 24-word recovery phrase with an invalid checksum', () => {
    expect(() =>
      loadConfig({
        env: {
          ...baseEnv,
          ZKUAT_SPONSOR_WALLET_SEED: `${'abandon '.repeat(23)}abandon`,
        },
        envFile: '/does/not/exist',
      }),
    ).toThrow('24-word English BIP-39 recovery phrase');
  });
});
