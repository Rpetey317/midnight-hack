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

  it('rejects an unknown network', () => {
    expect(() =>
      loadConfig({ env: { ...baseEnv, ZKUAT_NETWORK: 'mainnet' }, envFile: '/does/not/exist' }),
    ).toThrow('ZKUAT_NETWORK must be one of local, preview, preprod');
  });

  it('omits the sponsor seed entirely for read-only commands', () => {
    const config = loadConfig({
      env: { ZKUAT_NETWORK: 'preview', ZKUAT_CONTRACT_ADDRESS: 'ab'.repeat(32) },
      envFile: '/does/not/exist',
      requireSeed: false,
    });
    expect(config.sponsorSeed).toBe('');
  });

  describe('local devnet', () => {
    const localEnv = {
      ZKUAT_NETWORK: 'local',
      ZKUAT_SPONSOR_WALLET_SEED: `${'0'.repeat(63)}1`,
      ZKUAT_CONTRACT_ADDRESS: 'ab'.repeat(32),
    };

    it('resolves the undeployed network id and loopback endpoints', () => {
      const config = loadConfig({ env: localEnv, envFile: '/does/not/exist' });
      expect(config.network).toBe('local');
      // The SDK identifier is not the configuration name: indexer-standalone is
      // configured with `undeployed` in the development compose stack.
      expect(config.networkId).toBe('undeployed');
      expect(config.indexer).toBe('http://127.0.0.1:8088/api/v4/graphql');
      expect(config.indexerWS).toBe('ws://127.0.0.1:8088/api/v4/graphql/ws');
      expect(config.node).toBe('http://127.0.0.1:9944');
    });

    it('accepts a raw 32-byte hexadecimal seed, with or without 0x', () => {
      const expected = `${'0'.repeat(63)}1`;
      expect(loadConfig({ env: localEnv, envFile: '/does/not/exist' }).sponsorSeed).toBe(expected);
      expect(
        loadConfig({
          env: { ...localEnv, ZKUAT_SPONSOR_WALLET_SEED: `0X${'0'.repeat(63)}1` },
          envFile: '/does/not/exist',
        }).sponsorSeed,
      ).toBe(expected);
    });

    it('still accepts a recovery phrase', () => {
      const config = loadConfig({
        env: { ...localEnv, ZKUAT_SPONSOR_WALLET_SEED: recoveryPhrase },
        envFile: '/does/not/exist',
      });
      expect(config.sponsorSeed).toHaveLength(128);
    });

    it('rejects a hexadecimal seed of the wrong length', () => {
      expect(() =>
        loadConfig({
          env: { ...localEnv, ZKUAT_SPONSOR_WALLET_SEED: '0'.repeat(32) },
          envFile: '/does/not/exist',
        }),
      ).toThrow('recovery phrase or a 64-character hexadecimal seed');
    });
  });

  // The raw-seed escape hatch exists only because a devnet's genesis accounts
  // are funded by seed and no phrase restores them. It must not widen the
  // surface on a network where the seed is worth stealing.
  it.each(['preview', 'preprod'])('rejects a raw hexadecimal seed on %s', (network) => {
    expect(() =>
      loadConfig({
        env: {
          ...baseEnv,
          ZKUAT_NETWORK: network,
          ZKUAT_SPONSOR_WALLET_SEED: `${'0'.repeat(63)}1`,
        },
        envFile: '/does/not/exist',
      }),
    ).toThrow('must be a valid 24-word English BIP-39 recovery phrase');
  });
});
