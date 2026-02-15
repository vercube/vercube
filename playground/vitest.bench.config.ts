import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(rootDir, '..');

export default defineConfig({
  root: rootDir,
  test: {
    environment: 'node',
    include: ['test/**/*.bench.ts'],
  },
  resolve: {
    alias: [
      {
        find: /^@vercube\/([^/]+)(\/.*)?$/,
        replacement: `${resolve(repoRoot, 'packages')}/$1/src$2`,
      },
    ],
  },
});
