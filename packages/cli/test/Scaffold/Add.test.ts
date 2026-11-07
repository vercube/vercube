import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/Recipes/Catalog';
import { addModules, findProjectRoot, projectPackageManager } from '../../src/Scaffold/Add';
import { apiTemplate } from '../Fixtures';
import type { AddOptions } from '../../src/Scaffold/Add';
import type { Prompter } from '../../src/Scaffold/Plan';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const noPrompts: Prompter = {
  text: () => Promise.reject(new Error('asked')),
  select: () => Promise.reject(new Error('asked')),
  multiselect: () => Promise.reject(new Error('asked')),
};

const project = (overrides?: Record<string, string | null>): string => {
  const dir = apiTemplate(overrides);

  dirs.push(dir);

  return dir;
};

const options = (root: string, overrides: Partial<AddOptions> = {}): AddOptions => ({
  root,
  version: '1.5.0',
  recipes: RECIPES,
  flags: {},
  yes: false,
  interactive: false,
  prompter: noPrompts,
  packageManager: 'pnpm',
  install: false,
  ...overrides,
});

describe('addModules', () => {
  it('should add a module with its answers from flags', async () => {
    const root = project();
    const summary = await addModules(['queue'], options(root, { flags: { queue: 'rabbitmq' } }));

    expect(summary.applied).toEqual(['queue']);
    expect(readFileSync(join(root, 'vercube.config.ts'), 'utf8')).toContain('RabbitMQStrategy');
    // pnpm projects get the approvals for packages with install scripts
    expect(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('msgpackr-extract: true');
  });

  it('should ask what flags did not answer, in a terminal', async () => {
    const root = project();
    const prompter: Prompter = { ...noPrompts, select: async () => 'kafka' };

    await addModules(['queue'], options(root, { interactive: true, prompter }));

    expect(readFileSync(join(root, 'vercube.config.ts'), 'utf8')).toContain('KafkaStrategy');
  });

  it('should list the missing flags without a terminal, and take defaults with --yes', async () => {
    const root = project();

    await expect(addModules(['queue', 'scheduler'], options(root))).rejects.toThrow('Missing --queue, --scheduler-store.');

    const summary = await addModules(['queue'], options(root, { yes: true }));

    expect(summary.dependencies).toContain('bullmq');
  });

  it('should change nothing for a module already added', async () => {
    const root = project();

    await addModules(['schema'], options(root));

    const again = await addModules(['schema'], options(root));

    expect(again).toMatchObject({ created: [], updated: [], dependencies: [] });
  });

  it('should refuse a project without the @/ alias', async () => {
    const root = project({ 'tsconfig.json': JSON.stringify({ compilerOptions: {} }) });

    await expect(addModules(['schema'], options(root))).rejects.toThrow('Add "paths": { "@/*": ["./src/*"] }');
  });

  it('should load the recipe a package ships', async () => {
    const root = project();
    const pkg = join(root, 'node_modules', '@acme', 'vercube-search');

    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ name: '@acme/vercube-search', type: 'module', exports: { './recipe': './recipe.js' } }),
    );
    writeFileSync(
      join(pkg, 'recipe.js'),
      `export default { id: 'search', label: 'Search', apply: ({ project }) => project.addDependencies({ '@acme/vercube-search': '^1.0.0' }) };\n`,
    );

    const summary = await addModules(['@acme/vercube-search'], options(root));

    expect(summary.applied).toEqual(['@acme/vercube-search']);
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies['@acme/vercube-search']).toBe('^1.0.0');
  });

  const installPackage = (root: string, name: string, files: Record<string, string>) => {
    const dir = join(root, 'node_modules', name);

    mkdirSync(dir, { recursive: true });

    for (const [file, content] of Object.entries(files)) {
      writeFileSync(join(dir, file), content);
    }
  };

  const RECIPE = `{ id: 'x', label: 'X', prompts: [{ name: 'engine', flag: 'search-engine', message: '', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }], apply: ({ project, answers }) => project.addEnv({ ENGINE: answers.engine }) }`;

  it.each([
    [
      'an ESM-only exports map',
      {
        'package.json': JSON.stringify({ name: 'p', exports: { './recipe': { import: './r.mjs' } } }),
        'r.mjs': `export default ${RECIPE};`,
      },
    ],
    [
      'CommonJS exports.recipe',
      {
        'package.json': JSON.stringify({ name: 'p', exports: { './recipe': './r.cjs' } }),
        'r.cjs': `exports.recipe = ${RECIPE};`,
      },
    ],
    [
      'transpiled CommonJS',
      {
        'package.json': JSON.stringify({ name: 'p' }),
        'recipe.cjs': `Object.defineProperty(exports, '__esModule', { value: true }); exports.default = ${RECIPE};`,
      },
    ],
  ])('should load a recipe from %s, answering its question from the command line', async (_label, files) => {
    const root = project();

    installPackage(root, 'p', files);

    await addModules(['p'], options(root, { argv: ['p', '--search-engine', 'b'] }));

    expect(readFileSync(join(root, '.env'), 'utf8')).toContain('ENGINE=b');
  });

  it('should leave the project as it was when a recipe fails', async () => {
    const root = project();
    const before = readFileSync(join(root, 'package.json'), 'utf8');

    installPackage(root, 'broken', {
      'package.json': JSON.stringify({ name: 'broken' }),
      'recipe.mjs': `export default { id: 'b', label: 'B', apply: ({ project }) => { project.addDependencies({ zod: '^4.0.0' }); project.createFile('src/x.ts', 'x'); throw new Error('boom'); } };`,
    });

    await expect(addModules(['broken'], options(root))).rejects.toThrow('boom');

    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before);
    expect(existsSync(join(root, 'src/x.ts'))).toBe(false);
  });

  it('should accept a tsconfig that inherits its paths', async () => {
    const root = project({ 'tsconfig.json': JSON.stringify({ extends: './tsconfig.base.json', compilerOptions: {} }) });

    await expect(addModules(['schema'], options(root))).resolves.toMatchObject({ applied: ['schema'] });
  });

  it('should explain a name that is neither a module nor an installed package', async () => {
    await expect(addModules(['nope'], options(project()))).rejects.toThrow('"nope" is not a built-in module');
    await expect(addModules([], options(project()))).rejects.toThrow('Name the modules to add');
  });
});

describe('findProjectRoot', () => {
  it('should find the workspace an app belongs to', () => {
    const root = project({ 'pnpm-workspace.yaml': 'packages:\n  - apps/*\n', 'apps/api/package.json': '{}' });

    expect(findProjectRoot(join(root, 'apps/api'))).toBe(root);
  });

  it('should keep a directory outside any workspace', () => {
    const root = project();

    expect(findProjectRoot(root)).toBe(root);
  });
});

describe('projectPackageManager', () => {
  it('should read the packageManager field, then the lockfile', () => {
    expect(projectPackageManager(project())).toBe('pnpm');
    expect(
      projectPackageManager(
        project({ 'package.json': JSON.stringify({ dependencies: { '@vercube/core': '1' } }), 'yarn.lock': '' }),
      ),
    ).toBe('yarn');
    expect(projectPackageManager(project({ 'package.json': JSON.stringify({}) }))).toBe('npm');
  });
});
