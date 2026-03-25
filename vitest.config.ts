import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run all __tests__/**/*.test.ts across packages and apps
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'packages/**/__tests__/**/*.spec.ts',
      'apps/**/__tests__/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.git/**'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['packages/**/*.ts'],
      exclude: ['**/__tests__/**', '**/node_modules/**'],
    },
    // Timeout for async tests (oracle fetches, etc.)
    testTimeout: 10000,
    // Reporter
    reporter: 'verbose',
  },
  resolve: {
    alias: {
      '@rawagon/zk-identity':    new URL('./packages/zk-identity/index.ts', import.meta.url).pathname,
      '@rawagon/allcard-sdk':    new URL('./packages/allcard-sdk/index.ts',  import.meta.url).pathname,
      '@rawagon/fee-distributor':new URL('./packages/fee-distributor/index.ts', import.meta.url).pathname,
      '@rawagon/ltn-token':      new URL('./packages/ltn-token/index.ts',    import.meta.url).pathname,
      '@rawagon/gold-oracle':    new URL('./packages/gold-oracle/index.ts',  import.meta.url).pathname,
      '@rawagon/rawnet-sdk':     new URL('./packages/rawnet-sdk/index.ts',   import.meta.url).pathname,
      '@rawagon/contracts-sdk':  new URL('./packages/contracts-sdk/contracts.js', import.meta.url).pathname,
    },
  },
});
