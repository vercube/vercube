import { defineRecipe } from '../Apply';
import { VERSIONS } from './Versions';

const TEST = `import { createTestApp } from '@vercube/testing';
import type { TestApp } from '@vercube/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import FooController from '../src/controller/FooController';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp({ controllers: [FooController] });
});

afterAll(() => app.close());

it('answers GET /api/foo', async () => {
  const response = await app.get('/api/foo').expect(200);

  expect(await response.json()).toEqual({ message: 'Hello, world!' });
});
`;

const VITEST_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
`;

export const testingRecipe = defineRecipe({
  id: 'testing',
  label: 'Testing',
  hint: 'vitest and @vercube/testing',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/testing': 'latest', vitest: VERSIONS.vitest }, { dev: true });
    project.addScript('test', 'vitest run');
    project.createFile('vitest.config.ts', VITEST_CONFIG);

    if (project.exists('src/controller/FooController.ts')) {
      project.createFile('test/FooController.test.ts', TEST);
    }

    project.updateJson('tsconfig.json', (tsconfig) => {
      const include: string[] = tsconfig.include ?? [];

      if (include.includes('./test/**/*.ts')) {
        return false;
      }

      tsconfig.include = [...include, './test/**/*.ts'];

      return true;
    });
  },
});
