import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts'],
    projects: ['packages/*'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        'packages/**/src/**/*.d.ts',
        'packages/**/src/**/*.test.ts',
        'packages/**/src/**/*.mock.ts',
        // this is only proxy for the cli package
        'packages/create-app/**',
        // this package is not needed to be tested
        'packages/cli/**',
        // we should no test types
        'packages/**/Types/**',
        // bundlers
        'packages/devkit/src/Bundlers/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@vercube/*': './packages/$1/src',
    },
  },
});
