import codspeedPlugin from '@codspeed/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The benches run without `projects`: a project does not inherit the plugins of
// the root config, so under `projects` CodSpeed's benchmark provider never
// reaches them and nothing is measured.
export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    globals: true,
    environment: 'node',
    benchmark: {
      include: ['packages/**/test/**/*.bench.ts', 'playground/test/**/*.bench.ts'],
    },
  },
});
