import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const baseEnv = {
  ZKUAT_NETWORK: 'preview',
  ZKUAT_SPONSOR_WALLET_SEED: '11'.repeat(32),
  ZKUAT_CONTRACT_ADDRESS: 'ab'.repeat(32),
};

describe('loadConfig', () => {
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
      `ZKUAT_NETWORK=preprod\nZKUAT_SPONSOR_WALLET_SEED=${'22'.repeat(32)}\nZKUAT_CONTRACT_ADDRESS=${'cd'.repeat(32)}\n`,
    );
    const config = loadConfig({ env: {}, envFile: file });
    expect(config.network).toBe('preprod');
    expect(config.sponsorSeed).toBe('22'.repeat(32));
  });
});
