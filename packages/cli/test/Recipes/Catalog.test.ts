import { readFileSync, rmSync } from 'node:fs';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';
import { applyRecipes } from '../../src/Recipes/Apply';
import { RECIPES } from '../../src/Recipes/Catalog';
import { listFiles, Project } from '../../src/Recipes/Project';
import { apiTemplate } from '../Fixtures';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const snapshot = (root: string): Record<string, string> =>
  Object.fromEntries(listFiles(root).map((file) => [file, readFileSync(join(root, file), 'utf8')]));

/** Every recipe with every answer its prompts accept. */
const cases = RECIPES.flatMap((recipe) => {
  const prompt = recipe.prompts?.[0];

  return prompt
    ? prompt.options.map((option) => ({
        id: recipe.id,
        answers: { [prompt.name]: option.value },
        label: `${recipe.id} ${option.value}`,
      }))
    : [{ id: recipe.id, answers: {}, label: recipe.id }];
});

describe('module recipes', () => {
  it.each(cases)('$label applies and changes nothing applied again', async ({ id, answers }) => {
    const dir = apiTemplate();

    dirs.push(dir);

    const first = await applyRecipes(new Project(dir, { version: '1.5.0' }), [id], RECIPES, { [id]: answers });
    const after = snapshot(dir);
    const second = await applyRecipes(new Project(dir, { version: '1.5.0' }), [id], RECIPES, { [id]: answers });

    expect(first.applied).toContain(id);
    expect(snapshot(dir)).toEqual(after);
    expect(second).toMatchObject({ created: [], updated: [], dependencies: [], services: [] });

    // every @vercube package is pinned to the CLI version
    const pkg = JSON.parse(after['package.json']);
    const added = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
      ([name]) => name.startsWith('@vercube/') && !['@vercube/core', '@vercube/di', '@vercube/cli'].includes(name),
    );

    expect(added.length).toBeGreaterThan(0);
    expect(added.every(([, version]) => version === '1.5.0')).toBe(true);
  });

  it('applies every module together, once', async () => {
    const dir = apiTemplate();

    dirs.push(dir);

    const modules = RECIPES.filter((recipe) => recipe.kind !== 'deploy').map((recipe) => recipe.id);
    const summary = await applyRecipes(new Project(dir, { version: '1.5.0' }), [...modules, 'aws-lambda'], RECIPES, {
      queue: { driver: 'bullmq' },
      scheduler: { store: 'redis' },
    });

    const files = snapshot(dir);

    expect(summary.applied.at(-1)).toBe('aws-lambda');
    // Redis is shared by the queue and the scheduler
    expect(files['docker-compose.yml'].match(/^ {2}redis:/gm)).toHaveLength(1);
    expect(files['.env.example'].match(/REDIS_URL=/g)).toHaveLength(1);
    expect(files['src/boot/Container.ts'].match(/container\.bind\(StorageManager\)/g)).toHaveLength(1);
    // the storage manager is bound before anything mounts on it
    expect(files['src/boot/Container.ts'].indexOf('bind(StorageManager)')).toBeLessThan(
      files['src/boot/Container.ts'].indexOf('.mount('),
    );
    expect(files['src/index.ts']).toContain(
      'export const handler: ReturnType<typeof toServerlessHandler> = toServerlessHandler(app);',
    );
  });

  it('adds storage for the cache and reports it', async () => {
    const dir = apiTemplate();

    dirs.push(dir);

    const summary = await applyRecipes(new Project(dir, { version: '1.5.0' }), ['cache'], RECIPES);

    expect(summary.implied).toEqual(['storage']);
    expect(summary.applied).toEqual(['storage', 'cache']);
  });
});
