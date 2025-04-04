import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts'],
    workspace: ['packages/*'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        'packages/**/src/**/*.d.ts',
        'packages/**/src/**/*.test.ts',
        'packages/**/src/**/*.mock.ts',
        // this is only for nx workspace build
        'packages/nx/**',
        // we should no test types
        'packages/**/Types/**',
      ],
    },
  },
});