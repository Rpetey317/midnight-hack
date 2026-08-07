import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    // @zkuat/contract loads a WASM module (onchain-runtime-v3) to expose
    // pureCircuits. One worker keeps it instantiated once rather than per file.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
