import { readFileSync, rmSync } from 'node:fs';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';
import { applyRecipes, defineRecipe } from '../../src/Recipes/Apply';
import { Project } from '../../src/Recipes/Project';
import { listFiles } from '../../src/Recipes/Project';
import { RecipeError } from '../../src/Recipes/RecipeError';
import { resolveRecipes } from '../../src/Recipes/Resolve';
import { apiTemplate } from '../Fixtures';
import type { RecipeTypes } from '../../src/Recipes/RecipeTypes';

const recipe = (id: string, extra: Partial<RecipeTypes.Recipe<any>> = {}): RecipeTypes.Recipe<any> =>
  defineRecipe({ id, label: id, apply: () => {}, ...extra });

describe('resolveRecipes', () => {
  const catalog = [
    recipe('schema'),
    recipe('queue', {
      prompts: [{ name: 'driver', flag: 'queue', message: '', options: [], default: 'memory' }],
      requires: (answers) => (answers.driver === 'redis' ? ['redis'] : []),
    }),
    recipe('redis'),
    recipe('scheduler', { requires: ['queue'] }),
    recipe('devtools', { after: ['queue', 'scheduler'] }),
    recipe('lambda', { kind: 'deploy' }),
    recipe('nitro', { kind: 'deploy' }),
  ];

  const ids = (selected: string[], answers?: Record<string, Record<string, string>>) =>
    resolveRecipes(selected, catalog, answers).recipes.map((r) => r.id);

  it('should apply required recipes first and report them as implied', () => {
    const { recipes, implied } = resolveRecipes(['scheduler'], catalog);

    expect(recipes.map((r) => r.id)).toEqual(['queue', 'scheduler']);
    expect(implied).toEqual(['queue']);
  });

  it('should require by answer', () => {
    expect(ids(['queue'], { queue: { driver: 'redis' } })).toEqual(['redis', 'queue']);
    expect(ids(['queue'], { queue: { driver: 'memory' } })).toEqual(['queue']);
  });

  it('should order by after only when both are selected', () => {
    expect(ids(['devtools', 'scheduler'])).toEqual(['queue', 'scheduler', 'devtools']);
    expect(ids(['devtools'])).toEqual(['devtools']);
  });

  it('should put deploy targets last and keep the catalog order otherwise', () => {
    expect(ids(['lambda', 'devtools', 'schema'])).toEqual(['schema', 'devtools', 'lambda']);
  });

  it('should refuse unknown ids, two deploy targets and cycles', () => {
    expect(() => ids(['nope', 'zzz'])).toThrow('Unknown modules: nope, zzz. Available: schema');
    expect(() => ids(['lambda', 'nitro'])).toThrow('Pick one deploy target, got lambda and nitro');
    expect(() => resolveRecipes(['a'], [recipe('a', { requires: ['b'] }), recipe('b', { requires: ['a'] })])).toThrow(
      'cycle: a -> b -> a',
    );
    expect(() => resolveRecipes(['a'], [recipe('a', { requires: ['ghost'] })])).toThrow('requires "ghost"');
  });
});

describe('applyRecipes', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const project = () => {
    const dir = apiTemplate();

    dirs.push(dir);

    return new Project(dir, { version: '1.5.0' });
  };

  const queue = defineRecipe<{ driver: string }>({
    id: 'queue',
    label: 'Queue',
    prompts: [{ name: 'driver', flag: 'queue', message: 'Driver?', options: [], default: 'memory' }],
    apply: ({ project, answers, selected }) => {
      project.addDependencies({ '@vercube/queue': 'latest' });
      project.createFile('src/jobs/Jobs.ts', `export class Jobs {} // ${answers.driver} ${selected.has('scheduler')}\n`);
      project.bind({ name: 'Jobs', from: '@/jobs/Jobs' });
      project.addPlugin({ name: 'QueuePlugin', from: '@vercube/queue' });
      project.addEnv({ QUEUE: answers.driver }, 'Queue');
      project.addComposeService('redis', { image: 'redis:7-alpine' });
      project.note('docker compose up -d');
    },
  });

  it('should apply with prompt defaults and summarize', async () => {
    const api = project();
    const summary = await applyRecipes(api, ['queue'], [queue]);

    expect(summary).toMatchObject({
      applied: ['queue'],
      implied: [],
      dependencies: ['@vercube/queue'],
      services: ['redis'],
      notes: ['docker compose up -d'],
    });
    expect(summary.created.toSorted()).toEqual(['.env', '.env.example', 'docker-compose.yml', 'src/jobs/Jobs.ts']);
    expect(summary.updated.toSorted()).toEqual(['package.json', 'src/boot/Container.ts', 'vercube.config.ts']);
    expect(readFileSync(join(api.root, 'src/jobs/Jobs.ts'), 'utf8')).toContain('memory false');
  });

  it('should change nothing when applied twice', async () => {
    const api = project();

    await applyRecipes(api, ['queue'], [queue], { queue: { driver: 'rabbitmq' } });

    const snapshot = Object.fromEntries(listFiles(api.root).map((file) => [file, readFileSync(join(api.root, file), 'utf8')]));
    const again = new Project(api.root, { version: '1.5.0' });
    const summary = await applyRecipes(again, ['queue'], [queue], { queue: { driver: 'rabbitmq' } });

    expect(Object.fromEntries(listFiles(api.root).map((file) => [file, readFileSync(join(api.root, file), 'utf8')]))).toEqual(
      snapshot,
    );
    expect(summary).toMatchObject({ created: [], updated: [], dependencies: [], services: [] });
  });

  it('should refuse a recipe that does not fit the project before applying anything', async () => {
    const api = project();
    const fullstackOnly = recipe('web', {
      unsupported: (p) => (p.layout === 'api' ? 'it needs a fullstack project' : undefined),
    });

    await expect(applyRecipes(api, ['queue', 'web'], [queue, fullstackOnly])).rejects.toThrow(
      'web cannot be added to this project: it needs a fullstack project',
    );
    expect(api.summary.created).toEqual([]);
  });

  it('should name the recipe a RecipeError came from', async () => {
    const api = project();
    const broken = recipe('broken', {
      label: 'Broken',
      apply: () => {
        throw new RecipeError('src/x.ts not found');
      },
    });

    await expect(applyRecipes(api, ['broken'], [broken])).rejects.toThrow('Broken: src/x.ts not found');
  });
});
