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

  it('guards the storage and queue example endpoints with API_KEY', async () => {
    const dir = apiTemplate();

    dirs.push(dir);

    await applyRecipes(new Project(dir, { version: '1.5.0' }), ['storage', 'queue'], RECIPES, {
      queue: { driver: 'memory' },
    });

    const files = snapshot(dir);

    expect(files['src/services/ApiKeyGuard.ts']).toContain('UnauthorizedError');
    expect(files['src/controller/FilesController.ts']).toContain('requireApiKey(apiKey)');
    expect(files['src/controller/FilesController.ts']).toContain('BadRequestError');
    expect(files['src/controller/FilesController.ts']).toContain('examples/');
    expect(files['src/controller/JobsController.ts']).toContain('requireApiKey(apiKey)');
    expect(files['.env.example'].match(/^API_KEY=change-me$/gm)).toHaveLength(1);
    expect(files['.env']).not.toContain('API_KEY=change-me');
  });

  it('shares one API_KEY with the auth recipe', async () => {
    const dir = apiTemplate();

    dirs.push(dir);

    await applyRecipes(new Project(dir, { version: '1.5.0' }), ['storage', 'auth'], RECIPES);

    expect(snapshot(dir)['.env'].match(/^API_KEY=/gm)).toHaveLength(1);
  });

  it('adds storage for the cache and reports it', async () => {
    const dir = apiTemplate();

    dirs.push(dir);

    const summary = await applyRecipes(new Project(dir, { version: '1.5.0' }), ['cache'], RECIPES);

    expect(summary.implied).toEqual(['storage']);
    expect(summary.applied).toEqual(['storage', 'cache']);
  });

  it('adds storage and the plugin for rate limits', async () => {
    const dir = apiTemplate();

    dirs.push(dir);

    const summary = await applyRecipes(new Project(dir, { version: '1.5.0' }), ['ratelimit'], RECIPES);
    const files = snapshot(dir);

    expect(summary.implied).toEqual(['storage']);
    expect(summary.applied).toEqual(['storage', 'ratelimit']);
    expect(files['vercube.config.ts']).toContain(`import { RateLimitPlugin } from '@vercube/ratelimit'`);
    expect(files['vercube.config.ts']).toContain('RateLimitPlugin');
    expect(files['src/controller/LoginController.ts']).toContain(`@RateLimit({ limit: 5, window: '1m' })`);
  });

  it('counts rate limits in a memory mount of their own unless storage is Redis', async () => {
    const memory = apiTemplate();
    const redis = apiTemplate();

    dirs.push(memory, redis);

    await applyRecipes(new Project(memory, { version: '1.5.0' }), ['ratelimit'], RECIPES, { storage: { driver: 's3' } });
    await applyRecipes(new Project(redis, { version: '1.5.0' }), ['ratelimit'], RECIPES, { storage: { driver: 'redis' } });

    const own = snapshot(memory);
    const shared = snapshot(redis);

    expect(own['src/boot/Container.ts']).toContain(`mount({ name: 'ratelimit', storage: MemoryStorage })`);
    expect(own['vercube.config.ts']).toMatch(/rateLimit: {\s*storage: 'ratelimit',?\s*}/);
    expect(shared['src/boot/Container.ts']).not.toContain(`name: 'ratelimit'`);
    expect(shared['vercube.config.ts']).not.toContain('rateLimit:');
  });
});
