import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    // The generated contract loads a WASM module (onchain-runtime-v3). One
    // worker keeps it instantiated once rather than per parallel file.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
